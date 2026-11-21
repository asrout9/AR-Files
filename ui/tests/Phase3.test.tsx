import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StateIcon } from "../src/components/StateIcon";
import { Sidebar } from "../src/components/Sidebar";
import { ContextMenu } from "../src/components/ContextMenu";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { EntryRecord, FileState } from "../src/types";

describe("Phase 3: Cloud Provider UI, State Icons, Quota & Offline Mode", () => {
  beforeEach(() => {
    useExplorerStore.setState({
      accounts: [
        {
          id: "acc_gdrive_test",
          provider_type: "google_drive",
          name: "My Google Drive",
          email: "user@gmail.com",
          quota_total: 15 * 1024 * 1024 * 1024, // 15 GB
          quota_used: 6 * 1024 * 1024 * 1024,  // 6 GB
          sync_status: "idle",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      currentAccountId: "acc_gdrive_test",
      currentFolderId: null,
      pendingUploadsCount: 0,
      entries: [],
      selectedIds: new Set(),
    });
  });

  it("renders all 8 file state overlay icons correctly", () => {
    const states: FileState[] = [
      "cloud_only",
      "hydrating",
      "available",
      "pinned",
      "syncing_up",
      "conflict",
      "error",
      "excluded",
    ];

    states.forEach((state) => {
      const { unmount } = render(<StateIcon state={state} />);
      const overlay = document.querySelector(`.adw-state-${state}`);
      expect(overlay).not.toBeNull();
      unmount();
    });
  });

  it("renders Google Drive quota progress bar and used storage in Sidebar", () => {
    render(<Sidebar />);

    expect(screen.getByText("My Google Drive")).toBeDefined();
    expect(screen.getByText("6.0 GB of 15 GB")).toBeDefined();
  });

  it("handles offline mode toggling and displays pending uploads", () => {
    useExplorerStore.setState({
      accounts: [
        {
          id: "acc_gdrive_test",
          provider_type: "google_drive",
          name: "My Google Drive",
          quota_total: 15 * 1024 * 1024 * 1024,
          quota_used: 6 * 1024 * 1024 * 1024,
          sync_status: "offline",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      pendingUploadsCount: 3,
    });

    render(<Sidebar />);

    expect(screen.getByText(/Offline • 3 pending/i)).toBeDefined();
  });

  it("provides cloud operations in ContextMenu for cloud_only placeholders", () => {
    const mockEntry: EntryRecord = {
      id: "entry_doc_1",
      account_id: "acc_gdrive_test",
      remote_id: "remote_123",
      parent_id: null,
      name: "Q4_Financials.pdf",
      path: "/Q4_Financials.pdf",
      is_directory: false,
      size: 1048576,
      mtime: Date.now(),
      ctime: Date.now(),
      mime_type: "application/pdf",
      state: "cloud_only",
      sync_version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const handleClose = vi.fn();
    const handleProperties = vi.fn();
    const handleRename = vi.fn();

    render(
      <ContextMenu
        entry={mockEntry}
        x={100}
        y={100}
        onClose={handleClose}
        onOpenProperties={handleProperties}
        onStartRename={handleRename}
      />
    );

    // Download now and Always keep should be present
    expect(screen.getByText("Download now")).toBeDefined();
    expect(screen.getByText("Always keep on this device")).toBeDefined();
    expect(screen.getByText("Copy share link")).toBeDefined();

    // Trigger download now
    fireEvent.click(screen.getByText("Download now"));
    expect(handleClose).toHaveBeenCalled();
  });

  it("provides Free Up Space action for available hydrated items", () => {
    const mockEntry: EntryRecord = {
      id: "entry_doc_2",
      account_id: "acc_gdrive_test",
      remote_id: "remote_456",
      parent_id: null,
      name: "Presentation.key",
      path: "/Presentation.key",
      is_directory: false,
      size: 5242880,
      mtime: Date.now(),
      ctime: Date.now(),
      mime_type: "application/x-iwork-keynote-sffkey",
      state: "available",
      local_path: "/home/user/.cache/ar-files/content/entry_doc_2",
      sync_version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const handleClose = vi.fn();

    render(
      <ContextMenu
        entry={mockEntry}
        x={50}
        y={50}
        onClose={handleClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    expect(screen.getByText("Free up space")).toBeDefined();
    fireEvent.click(screen.getByText("Free up space"));
    expect(handleClose).toHaveBeenCalled();
  });
});
