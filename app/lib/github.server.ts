import { Octokit } from "@octokit/rest";
import { createHmac } from "crypto";
import { config } from "~/config.server";

export const octokit = new Octokit({
  auth: config.github.token,
});

// Parse GitHub repo string into owner and repo
export function parseRepoString(repoString: string): {
  owner: string;
  repo: string;
} {
  const [owner, repo] = repoString.split("/");
  return { owner, repo };
}

// Fetch file content from GitHub
export async function fetchScriptFromGitHub(
  path: string
): Promise<string | null> {
  try {
    const { owner, repo } = parseRepoString(config.github.repo);
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    if ("content" in data) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    return null;
  } catch (error) {
    console.error("Error fetching script from GitHub:", error);
    return null;
  }
}

// Get PR approvers
export async function getPRApprovers(prNumber: number): Promise<string[]> {
  try {
    const { owner, repo } = parseRepoString(config.github.repo);
    const reviews = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get unique approvers
    const approvers = reviews.data
      .filter((r) => r.state === "APPROVED")
      .map((r) => r.user?.login || "unknown");

    return [...new Set(approvers)];
  } catch (error) {
    console.error("Error fetching PR approvers:", error);
    return [];
  }
}

// Get files changed in a PR
export async function getPRFiles(
  prNumber: number
): Promise<Array<{ filename: string; status: string }>> {
  try {
    const { owner, repo } = parseRepoString(config.github.repo);
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    return data.map((file) => ({
      filename: file.filename,
      status: file.status,
    }));
  } catch (error) {
    console.error("Error fetching PR files:", error);
    return [];
  }
}

// Verify GitHub webhook signature
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  if (!config.github.webhookSecret) {
    console.warn("No webhook secret configured, skipping verification");
    return true;
  }

  const hmac = createHmac("sha256", config.github.webhookSecret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  return signature === digest;
}

// Extract target database from SQL file metadata only
// Looks for -- TargetDatabase: staging or -- TargetDatabase: production comment
export function extractTargetDatabase(
  filePath: string,
  content?: string
): "staging" | "production" | null {
  // Only check metadata - no path-based detection
  if (content) {
    const metadata = parseSQLMetadata(content);
    if (metadata.target) {
      const target = metadata.target.toLowerCase();
      if (target === "staging" || target === "production") {
        return target as "staging" | "production";
      }
    }
  }

  // Return null if no metadata found - caller will default to staging
  return null;
}

// Parse SQL file metadata from comments
export function parseSQLMetadata(content: string): {
  author?: string;
  purpose?: string;
  target?: string;
  date?: string;
  directProd?: boolean;
} {
  const metadata: any = {};
  const lines = content.split("\n").slice(0, 20); // Check first 20 lines for metadata

  for (const line of lines) {
    const lowerLine = line.toLowerCase().trim();
    if (line.startsWith("-- Author:")) {
      metadata.author = line.replace("-- Author:", "").trim();
    } else if (line.startsWith("-- Purpose:")) {
      metadata.purpose = line.replace("-- Purpose:", "").trim();
    } else if (line.startsWith("-- Target:")) {
      metadata.target = line.replace("-- Target:", "").trim();
    } else if (line.startsWith("-- Date:")) {
      metadata.date = line.replace("-- Date:", "").trim();
    } else if (
      lowerLine.includes("directprod") ||
      lowerLine.includes("direct-prod") ||
      lowerLine.includes("direct_prod")
    ) {
      // Check for -- DirectProd: true or -- DirectProd:true or -- DirectProd
      const match = line.match(/--\s*DirectProd\s*:?\s*(true|yes|1)?/i);
      metadata.directProd = match
        ? match[1]?.toLowerCase() === "true" ||
          match[1]?.toLowerCase() === "yes" ||
          match[1] === "1" ||
          !match[1]
        : false;
    }
  }

  return metadata;
}

// Get all merged PRs from GitHub
export async function getMergedPRs(limit: number = 50): Promise<
  Array<{
    number: number;
    merged_at: string | null;
    html_url: string;
  }>
> {
  try {
    const { owner, repo } = parseRepoString(config.github.repo);
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: limit,
    });

    // Filter for merged PRs only
    return data
      .filter((pr) => pr.merged_at !== null)
      .map((pr) => ({
        number: pr.number,
        merged_at: pr.merged_at!,
        html_url: pr.html_url,
      }));
  } catch (error) {
    console.error("Error fetching merged PRs:", error);
    return [];
  }
}

// Sync scripts from GitHub - checks for merged PRs and adds missing scripts
export async function syncScriptsFromGitHub(
  addApprovedScript: (data: {
    scriptName: string;
    scriptContent: string;
    targetDatabase: "staging" | "production";
    githubPrUrl: string;
    approvers: string[];
    directProd?: boolean;
  }) => Promise<boolean>,
  getExistingScriptNames: () => Promise<string[]>,
  minApprovals: number
): Promise<{ synced: number; skipped: number; errors: number }> {
  console.log("[Sync] Starting sync from GitHub...");

  const stats = { synced: 0, skipped: 0, errors: 0 };
  const existingScripts = await getExistingScriptNames();
  const existingSet = new Set(existingScripts);

  // Get merged PRs
  const mergedPRs = await getMergedPRs(50);
  console.log(`[Sync] Found ${mergedPRs.length} merged PRs to check`);

  for (const pr of mergedPRs) {
    try {
      // Check if PR has enough approvals
      const approvers = await getPRApprovers(pr.number);

      if (approvers.length < minApprovals) {
        console.log(
          `[Sync] PR #${pr.number} has ${approvers.length} approvals (need ${minApprovals}), skipping`
        );
        stats.skipped++;
        continue;
      }

      // Get files changed in the PR
      const files = await getPRFiles(pr.number);

      // Filter for SQL files (typically in sql/ folder)
      const sqlFiles = files.filter(
        (f) => f.filename.endsWith(".sql") && f.status !== "removed"
      );

      if (sqlFiles.length === 0) {
        stats.skipped++;
        continue;
      }

      // Process each SQL file
      for (const file of sqlFiles) {
        const scriptName = file.filename.split("/").pop() || file.filename;

        // Skip if script already exists
        if (existingSet.has(scriptName)) {
          console.log(`[Sync] Script ${scriptName} already exists, skipping`);
          stats.skipped++;
          continue;
        }

        // Fetch the file content first to parse metadata
        const content = await fetchScriptFromGitHub(file.filename);

        if (!content) {
          console.log(`[Sync] Failed to fetch content for ${file.filename}`);
          stats.errors++;
          continue;
        }

        // Parse metadata to check for DirectProd flag
        const metadata = parseSQLMetadata(content);
        const directProd = metadata.directProd === true;

        // Extract target database (defaults to staging for new workflow)
        // All scripts start as staging, unless they have DirectProd flag
        const targetDb =
          extractTargetDatabase(file.filename, content) || "staging";

        // Add to approved scripts
        const success = await addApprovedScript({
          scriptName,
          scriptContent: content,
          targetDatabase: targetDb,
          githubPrUrl: pr.html_url,
          approvers,
          directProd,
        });

        if (success) {
          console.log(
            `[Sync] ✓ Synced script: ${scriptName} from PR #${pr.number} (directProd: ${directProd})`
          );
          stats.synced++;
          existingSet.add(scriptName); // Add to set to avoid duplicates in same sync
        } else {
          stats.errors++;
        }
      }
    } catch (error) {
      console.error(`[Sync] Error processing PR #${pr.number}:`, error);
      stats.errors++;
    }
  }

  console.log(
    `[Sync] Complete: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors`
  );
  return stats;
}
