import { BUILD_ID } from "@/lib/version";

/** Small footer so anyone can confirm which GitHub commit the live site is running. */
export function VersionTag() {
  return (
    <footer className="py-6 text-center text-xs text-faint">
      NICOM Review Portal · version <span className="font-mono">{BUILD_ID}</span>
    </footer>
  );
}
