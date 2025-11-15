"use client";

import { ReactNode } from "react";
import { CDPHooksProvider } from "@coinbase/cdp-hooks";
import type { Config } from "@coinbase/cdp-core";

const config: Config = {
  projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID!,
  ethereum: {
    createOnLogin: "eoa",
  },
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <CDPHooksProvider config={config}>
      {children}
    </CDPHooksProvider>
  );
}
