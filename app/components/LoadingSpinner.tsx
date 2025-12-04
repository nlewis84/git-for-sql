import { ArrowClockwise } from "phosphor-react";

export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <ArrowClockwise
      size={size}
      weight="regular"
      className="animate-spin text-primary-600"
    />
  );
}

