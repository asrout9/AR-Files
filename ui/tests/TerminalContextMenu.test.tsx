import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContextMenu } from "../src/components/ContextMenu";
import { ListView } from "../src/components/ListView";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { EntryRecord } from "../src/types";
import * as ipcModule from "../src/services/ipc";

describe("Terminal Context Menu (On Folder and Inside Folder)", () => {
  const dummyFolder: EntryRecord = {
    id: "/home/user/Downloads",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "Downloads",
    path: "/home/user/Downloads",
    is_directory: true,
    size: 4096,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "inode/directory",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Downloads",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useExplorerStore.setState({
      currentAccountId: "acc_local",
      currentFolderId: "/home/user/Documents",
      breadcrumbs: [
        { id: "/home/user", name: "Home" },
        { id: "/home/user/Documents", name: "Documents" },
      ],
      entries: [dummyFolder],
      selectedIds: new Set(),
    });
  });

  it("shows 'Open in Terminal' when right clicking ON a folder icon and opens that specific folder", async () => {
    const invokeSpy = vi.spyOn(ipcModule, "invokeCommand").mockResolvedValue({ success: true });
    const onClose = vi.fn();
    const onOpenProperties = vi.fn();
    const onStartRename = vi.fn();

    render(
      <ContextMenu
        entry={dummyFolder}
        x={100}
        y={100}
        onClose={onClose}
        onOpenProperties={onOpenProperties}
        onStartRename={onStartRename}
      />
    );

    const termBtn = screen.getByRole("menuitem", { name: /Open in Terminal/i });
    expect(termBtn).toBeDefined();

    fireEvent.click(termBtn);

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("open_in_terminal", {
        path: "/home/user/Downloads",
        account_id: "acc_local",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows empty-space context menu with 'Open in Terminal' when right clicking INSIDE a folder", async () => {
    const invokeSpy = vi.spyOn(ipcModule, "invokeCommand").mockResolvedValue({ success: true });
    const onClose = vi.fn();
    const onOpenProperties = vi.fn();
    const onStartRename = vi.fn();

    render(
      <ContextMenu
        entry={null}
        x={200}
        y={200}
        onClose={onClose}
        onOpenProperties={onOpenProperties}
        onStartRename={onStartRename}
      />
    );

    expect(screen.getByRole("menuitem", { name: /New Folder/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Folder Intelligence & Cleanup/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Select All/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Properties/i })).toBeDefined();

    const termBtn = screen.getByRole("menuitem", { name: /Open in Terminal/i });
    expect(termBtn).toBeDefined();

    fireEvent.click(termBtn);

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("open_in_terminal", {
        path: "/home/user/Documents",
        account_id: "acc_local",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("triggers context menu with entry when right clicking on a row, and with null when right clicking on empty space", () => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 800 });
    HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 1000,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const onContextMenu = vi.fn();

    const { container } = render(<ListView onContextMenu={onContextMenu} />);

    // Right-click on row
    const row = container.querySelector(".adw-table-row");
    expect(row).toBeDefined();
    fireEvent.contextMenu(row!);
    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), dummyFolder);

    // Right-click on empty background container
    const outerContainer = container.firstChild as HTMLElement;
    fireEvent.contextMenu(outerContainer);
    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), null);
  });
});
