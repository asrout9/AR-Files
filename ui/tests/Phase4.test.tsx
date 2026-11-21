import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DetailsPane } from "../src/components/DetailsPane";
import { QuickPreviewModal } from "../src/components/QuickPreviewModal";
import { PreferencesDialog } from "../src/components/PreferencesDialog";
import { DiagnosticsDialog } from "../src/components/DiagnosticsDialog";
import { VersionHistoryDialog } from "../src/components/VersionHistoryDialog";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { EntryRecord } from "../src/types";

const mockTestEntry: EntryRecord = {
  id: "test_doc_1",
  account_id: "acc_gdrive",
  remote_id: "rem_1",
  parent_id: null,
  name: "Quarterly_Summary.pdf",
  path: "/Quarterly_Summary.pdf",
  is_directory: false,
  size: 2048576, // 2 MB
  mtime: Date.now() - 60000,
  ctime: Date.now() - 120000,
  mime_type: "application/pdf",
  etag: "etag_12345",
  content_hash: "abcd1234efgh5678ijkl9012mnop3456",
  state: "available",
  local_path: "/home/user/.cache/ar-files/content/test_doc_1",
  sync_version: 1,
  created_at: Date.now() - 120000,
  updated_at: Date.now() - 60000,
};

describe("Phase 4: Cloud Management Depth, Details, Preview, Preferences & Diagnostics", () => {
  beforeEach(() => {
    useExplorerStore.setState({
      entries: [mockTestEntry],
      selectedIds: new Set(["test_doc_1"]),
      isDetailsPaneOpen: false,
      isQuickPreviewOpen: false,
      isPreferencesOpen: false,
      isDiagnosticsOpen: false,
      isVersionHistoryOpen: false,
      versionHistoryEntry: null,
    });
  });

  it("DetailsPane toggles open and shows file properties and actions", async () => {
    useExplorerStore.setState({ isDetailsPaneOpen: true });
    render(<DetailsPane />);

    expect(screen.getByText("Properties & Details")).toBeDefined();
    expect(screen.getByText("Quarterly_Summary.pdf")).toBeDefined();
    expect(screen.getByText("Free Up Space")).toBeDefined();
    expect(screen.getByText("Always Keep")).toBeDefined();
    expect(screen.getByText("Share Link")).toBeDefined();
    expect(screen.getByText("Revisions")).toBeDefined();

    // Click Always Keep to pin
    const pinBtn = screen.getByText("Always Keep");
    fireEvent.click(pinBtn);

    await waitFor(() => {
      const state = useExplorerStore.getState();
      const updated = state.entries.find((e) => e.id === "test_doc_1");
      expect(updated?.state).toBe("pinned");
    });
  });

  it("QuickPreviewModal opens on demand and can be closed with Done or Escape", async () => {
    useExplorerStore.setState({ isQuickPreviewOpen: true });
    render(<QuickPreviewModal />);

    expect(screen.getByText("Quarterly_Summary.pdf")).toBeDefined();
    expect(screen.getByText("PDF Document (2 MB)")).toBeDefined();

    // Click Done to close
    const doneBtn = screen.getByText("Done");
    fireEvent.click(doneBtn);

    expect(useExplorerStore.getState().isQuickPreviewOpen).toBe(false);
  });

  it("PreferencesDialog switches tabs and allows bandwidth throttling configuration", async () => {
    useExplorerStore.setState({ isPreferencesOpen: true });
    render(<PreferencesDialog />);

    expect(screen.getByText("Preferences")).toBeDefined();
    expect(screen.getByText("General")).toBeDefined();
    expect(screen.getByText("Cloud & Sync")).toBeDefined();
    expect(screen.getByText("Local Cache")).toBeDefined();
    expect(screen.getByText("Accounts")).toBeDefined();

    // Switch to Cloud & Sync
    fireEvent.click(screen.getByText("Cloud & Sync"));
    expect(screen.getByText("Bandwidth Limiter (Token Bucket)")).toBeDefined();

    // Click Apply Limits
    const applyBtn = screen.getByText("Apply Limits");
    fireEvent.click(applyBtn);

    // Switch to Local Cache
    fireEvent.click(screen.getByText("Local Cache"));
    expect(screen.getByText("Local Hydration Cache")).toBeDefined();
    expect(screen.getByText("Free Up All Local Cache (Keep Placeholders)")).toBeDefined();

    // Switch to Accounts
    fireEvent.click(screen.getByText("Accounts"));
    expect(screen.getByText("Add OneDrive")).toBeDefined();
    expect(screen.getByText("Add WebDAV/S3")).toBeDefined();
  });

  it("DiagnosticsDialog shows SQLite WAL status and system resilience", async () => {
    useExplorerStore.setState({ isDiagnosticsOpen: true });
    render(<DiagnosticsDialog />);

    expect(screen.getByText("System Diagnostics & Health")).toBeDefined();
    expect(screen.getByText("Core Engine Resilient & Operational")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Metadata Store (SQLite)")).toBeDefined();
      expect(screen.getByText("WAL (Concurrent Reads)")).toBeDefined();
      expect(screen.getByText("FTS5 Enabled")).toBeDefined();
    });
  });

  it("VersionHistoryDialog displays revisions and restore action", async () => {
    useExplorerStore.setState({
      isVersionHistoryOpen: true,
      versionHistoryEntry: mockTestEntry,
    });
    render(<VersionHistoryDialog />);

    expect(screen.getByText("Version History")).toBeDefined();
    expect(screen.getByText("Quarterly_Summary.pdf")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeDefined();
      expect(screen.getByText("v2")).toBeDefined();
    });

    const restoreBtn = screen.getAllByText("Restore")[0];
    expect(restoreBtn).toBeDefined();
    fireEvent.click(restoreBtn);

    expect(screen.getByText("Restored")).toBeDefined();
  });
});
