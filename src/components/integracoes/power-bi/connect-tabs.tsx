"use client";

/**
 * ConnectTabs — Client wrapper de 3 tabs (Desktop / Service / Snippet) da
 * Connect page do Power BI.
 *
 * Tabs em base-ui (variant=line). Estado controlado localmente via
 * useState — não sincroniza com URL (a navegação é feita por link da
 * detail page; refrescar a Connect page sempre cai em "Desktop").
 *
 * Defaults: tab inicial = "desktop" (uso mais comum).
 */

import { useState } from "react";
import { CloudCog, FileCode2, Monitor } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { ConnectDesktopTab } from "./connect-desktop-tab";
import { ConnectServiceTab } from "./connect-service-tab";
import { ConnectSnippetTab, type ConnectSnippetView } from "./connect-snippet-tab";

interface ConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  passwordLast4: string;
}

interface Props {
  profileId: string;
  connectionInfo: ConnectionInfo;
  views: ConnectSnippetView[];
}

export function ConnectTabs({ profileId, connectionInfo, views }: Props) {
  const [tab, setTab] = useState<string>("desktop");

  const handleValueChange = (next: unknown) => {
    if (typeof next === "string") setTab(next);
  };

  return (
    <Tabs
      value={tab}
      onValueChange={handleValueChange}
      data-testid="connect-tabs"
    >
      <TabsList variant="line" className="w-full justify-start gap-1 overflow-x-auto">
        <TabsTrigger value="desktop" data-testid="connect-tab-desktop">
          <Monitor className="h-4 w-4" aria-hidden="true" />
          Power BI Desktop
        </TabsTrigger>
        <TabsTrigger value="service" data-testid="connect-tab-service">
          <CloudCog className="h-4 w-4" aria-hidden="true" />
          Service / Gateway
        </TabsTrigger>
        <TabsTrigger value="snippet" data-testid="connect-tab-snippet">
          <FileCode2 className="h-4 w-4" aria-hidden="true" />
          Snippet M
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="desktop"
        className="pt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <ConnectDesktopTab
          profileId={profileId}
          connectionInfo={connectionInfo}
        />
      </TabsContent>

      <TabsContent
        value="service"
        className="pt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <ConnectServiceTab />
      </TabsContent>

      <TabsContent
        value="snippet"
        className="pt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <ConnectSnippetTab
          host={connectionInfo.host}
          port={connectionInfo.port}
          database={connectionInfo.database}
          views={views}
        />
      </TabsContent>
    </Tabs>
  );
}
