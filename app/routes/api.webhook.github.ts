import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { verifyWebhookSignature, getPRApprovers, getPRFiles, fetchScriptFromGitHub, extractTargetDatabase, parseSQLMetadata } from "~/lib/github.server";
import { addApprovedScript } from "~/lib/audit.server";
import { config } from "~/config.server";

export async function action({ request }: ActionFunctionArgs) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Get the webhook signature
  const signature = request.headers.get("x-hub-signature-256") || "";
  
  // Get the raw body
  const payload = await request.text();
  
  console.log('[Webhook] Received webhook request');
  console.log('[Webhook] Signature present:', !!signature);
  
  // Verify the webhook signature
  if (!verifyWebhookSignature(payload, signature)) {
    console.error('[Webhook] Invalid signature - webhook secret may be mismatched');
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the payload
  let data;
  try {
    data = JSON.parse(payload);
  } catch (error) {
    console.error('[Webhook] Failed to parse JSON:', error);
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log('[Webhook] Event type:', data.action);
  console.log('[Webhook] PR merged?', data.pull_request?.merged);
  console.log('[Webhook] PR number:', data.pull_request?.number);

  // Only handle merged pull requests
  if (data.action !== "closed" || !data.pull_request?.merged) {
    console.log('[Webhook] Ignoring - not a merged PR');
    return json({ message: "Not a merged PR, ignoring" }, { status: 200 });
  }

  const prNumber = data.pull_request.number;
  const prUrl = data.pull_request.html_url;

  console.log(`Processing merged PR #${prNumber}`);

  // Get PR approvers
  const approvers = await getPRApprovers(prNumber);
  console.log(`[Webhook] PR #${prNumber} has ${approvers.length} approvals (need ${config.minApprovals})`);
  console.log(`[Webhook] Approvers:`, approvers);
  
  // Check if PR has enough approvals
  if (approvers.length < config.minApprovals) {
    console.log(`[Webhook] ❌ Insufficient approvals (${approvers.length}/${config.minApprovals})`);
    return json({ 
      message: `Insufficient approvals (${approvers.length}/${config.minApprovals})` 
    }, { status: 200 });
  }

  // Get files changed in the PR
  const files = await getPRFiles(prNumber);
  console.log(`[Webhook] Found ${files.length} files in PR`);
  console.log(`[Webhook] Files:`, files.map(f => `${f.filename} (${f.status})`));
  
  // Filter for SQL files (can be in any directory now)
  const sqlFiles = files.filter(f => 
    f.filename.endsWith('.sql') &&
    f.status !== 'removed'
  );

  console.log(`[Webhook] Found ${sqlFiles.length} SQL files after filtering`);
  
  if (sqlFiles.length === 0) {
    console.log('[Webhook] ❌ No SQL files found in PR');
    return json({ message: "No SQL files found in PR" }, { status: 200 });
  }

  // Process each SQL file
  const results = [];
  for (const file of sqlFiles) {
    console.log(`[Webhook] Processing file: ${file.filename}`);

    // Fetch the file content first to parse metadata
    const content = await fetchScriptFromGitHub(file.filename);
    
    if (!content) {
      console.log(`[Webhook] ❌ Failed to fetch content for ${file.filename}`);
      continue;
    }

    // Parse metadata to check for DirectProd flag
    const metadata = parseSQLMetadata(content);
    const directProd = metadata.directProd === true;

    // Extract target database (defaults to staging for new workflow)
    const targetDb = extractTargetDatabase(file.filename, content) || 'staging';

    console.log(`[Webhook] Target database: ${targetDb}, DirectProd: ${directProd}`);

    // Add to approved scripts
    const success = await addApprovedScript({
      scriptName: file.filename.split('/').pop() || file.filename,
      scriptContent: content,
      targetDatabase: targetDb,
      githubPrUrl: prUrl,
      approvers,
      directProd
    });

    if (success) {
      console.log(`[Webhook] ✓ Successfully added script: ${file.filename}`);
    } else {
      console.log(`[Webhook] ❌ Failed to add script: ${file.filename}`);
    }

    results.push({
      filename: file.filename,
      success,
      targetDatabase: targetDb
    });
  }

  return json({
    message: "Webhook processed successfully",
    prNumber,
    approvers,
    processedFiles: results
  }, { status: 200 });
}

