import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TabBar } from "../src/components/TabBar";
import { PropertiesDialog } from "../src/components/PropertiesDialog";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { EntryRecord } from "../src/types";

describe("Phase 1: Local File Manager & Tabs", () => {
  beforeEach(() => {
    useExplorerStore.setState({
      tabs: [
        {
          id: "tab_1",
          title: "Home",
          accountId: "acc_local",
          folderId: null,
          breadcrumbs: [{ id: null, name: "Home" }],
          history: [{ accountId: "acc_local", folderId: null, breadcrumbs: [{ id: null, name: "Home" }] }],
          historyIndex: 0,
        },
      ],
      activeTabId: "tab_1",
      entries: [
        {
          id: "e_dir",
          account_id: "acc_local",
          remote_id: null,
          parent_id: null,
          name: "Projects",
          path: "/home/user/Projects",
          is_directory: true,
          size: 4096,
          mtime: Date.now(),
          ctime: Date.now(),
          mime_type: "inode/directory",
          etag: null,
          content_hash: null,
          state: "available",
          local_path: "/home/user/Projects",
          error_message: null,
          sync_version: 1,
          last_accessed_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: "e_file1",
          account_id: "acc_local",
          remote_id: null,
          parent_id: null,
          name: "notes.txt",
          path: "/home/user/notes.txt",
          is_directory: false,
          size: 1024,
          mtime: Date.now(),
          ctime: Date.now(),
          mime_type: "text/plain",
          etag: null,
          content_hash: null,
          state: "available",
          local_path: "/home/user/notes.txt",
          error_message: null,
          sync_version: 1,
          last_accessed_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: "e_file2",
          account_id: "acc_local",
          remote_id: null,
          parent_id: null,
          name: ".hidden_config",
          path: "/home/user/.hidden_config",
          is_directory: false,
          size: 512,
          mtime: Date.now(),
          ctime: Date.now(),
          mime_type: "text/plain",
          etag: null,
          content_hash: null,
          state: "available",
          local_path: "/home/user/.hidden_config",
          error_message: null,
          sync_version: 1,
          last_accessed_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      selectedIds: new Set(),
      showHidden: false,
    });
  });

  it("renders TabBar and supports creating a new tab", () => {
    render(<TabBar />);
    expect(screen.getByText("Home")).toBeDefined();

    // Click new tab button
    const newTabBtn = screen.getByTitle("New Tab (Ctrl+T)");
    fireEvent.click(newTabBtn);

    const tabs = useExplorerStore.getState().tabs;
    expect(tabs.length).toBe(2);
  });

  it("handles selection and contiguous range selection in store", () => {
    const store = useExplorerStore.getState();

    // Single select first file
    store.toggleSelect("e_dir", false);
    expect(useExplorerStore.getState().selectedIds.has("e_dir")).toBe(true);

    // Contiguous range select to file1
    useExplorerStore.getState().toggleSelect("e_file1", false, true);
    const selected = useExplorerStore.getState().selectedIds;
    expect(selected.has("e_dir")).toBe(true);
    expect(selected.has("e_file1")).toBe(true);

    // Clear selection
    useExplorerStore.getState().clearSelection();
    expect(useExplorerStore.getState().selectedIds.size).toBe(0);
  });

  it("toggles hidden files state correctly", () => {
    expect(useExplorerStore.getState().showHidden).toBe(false);
    useExplorerStore.getState().toggleShowHidden();
    expect(useExplorerStore.getState().showHidden).toBe(true);
  });

  it("renders PropertiesDialog with General and Permissions tabs", () => {
    const dummyEntry: EntryRecord = {
      id: "entry_prop_test",
      account_id: "acc_local",
      remote_id: null,
      parent_id: null,
      name: "Document.pdf",
      path: "/home/user/Document.pdf",
      is_directory: false,
      size: 1048576, // 1 MB
      mtime: 1700000000000,
      ctime: 1700000000000,
      mime_type: "application/pdf",
      etag: null,
      content_hash: null,
      state: "cloud_only",
      local_path: null,
      error_message: null,
      sync_version: 1,
      last_accessed_at: null,
      created_at: 1700000000000,
      updated_at: 1700000000000,
    };

    render(<PropertiesDialog entry={dummyEntry} onClose={() => {}} />);

    // General tab should display file information and sparse placeholder hint
    expect(screen.getByText("Document.pdf")).toBeDefined();
    expect(screen.getByText("application/pdf")).toBeDefined();
    expect(screen.getByText("0 bytes (Sparse placeholder)")).toBeDefined();

    // Switch to Permissions tab
    const permsTabBtn = screen.getByText("Permissions");
    fireEvent.click(permsTabBtn);

    expect(screen.getByText("POSIX Access Control")).toBeDefined();
    expect(screen.getByText("0644")).toBeDefined();
    expect(screen.getByText("rw-r--r--")).toBeDefined();
  });
});
