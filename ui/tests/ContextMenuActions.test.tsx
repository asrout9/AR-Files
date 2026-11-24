// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextMenu } from "../src/components/ContextMenu";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { EntryRecord } from "../src/types";

describe("Context Menu Actions & Font Size Scaling", () => {
  const dummyFile: EntryRecord = {
    id: "/home/user/Documents/report.pdf",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "report.pdf",
    path: "/home/user/Documents/report.pdf",
    is_directory: false,
    size: 2048,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "application/pdf",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Documents/report.pdf",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const dummyDir: EntryRecord = {
    id: "/home/user/Documents/Projects",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "Projects",
    path: "/home/user/Documents/Projects",
    is_directory: true,
    size: 4096,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "inode/directory",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Documents/Projects",
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
      entries: [dummyFile, dummyDir],
      selectedIds: new Set([dummyFile.id]),
      clipboard: null,
      fontSize: 14,
    });
  });

  it("renders Copy, Cut, Duplicate, Copy Path, and Select All on item context menu", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        entry={dummyFile}
        x={100}
        y={100}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    const copyBtn = screen.getByRole("menuitem", { name: /^Copy(?! Path)/i });
    const cutBtn = screen.getByRole("menuitem", { name: /Cut/i });
    const duplicateBtn = screen.getByRole("menuitem", { name: /Duplicate/i });
    const copyPathBtn = screen.getByRole("menuitem", { name: /Copy Path/i });
    const selectAllBtn = screen.getByRole("menuitem", { name: /Select All/i });

    expect(copyBtn).toBeDefined();
    expect(cutBtn).toBeDefined();
    expect(duplicateBtn).toBeDefined();
    expect(copyPathBtn).toBeDefined();
    expect(selectAllBtn).toBeDefined();

    // Trigger copy
    fireEvent.click(copyBtn);
    expect(useExplorerStore.getState().clipboard).toEqual(
      expect.objectContaining({
        mode: "copy",
        entries: [dummyFile],
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("triggers cut and updates clipboard correctly", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        entry={dummyFile}
        x={100}
        y={100}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    const cutBtn = screen.getByRole("menuitem", { name: /Cut/i });
    fireEvent.click(cutBtn);

    expect(useExplorerStore.getState().clipboard).toEqual(
      expect.objectContaining({
        mode: "cut",
        entries: [dummyFile],
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("renders Paste and Select All on empty-space context menu and executes paste", () => {
    const onClose = vi.fn();
    // Initially clipboard is null, so Paste is disabled
    const { rerender } = render(
      <ContextMenu
        entry={null}
        x={150}
        y={150}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    const pasteBtn = screen.getByRole("menuitem", { name: /Paste/i });
    expect(pasteBtn).toBeDefined();
    expect(pasteBtn.hasAttribute("disabled")).toBe(true);

    const selectAllBtn = screen.getByRole("menuitem", { name: /Select All/i });
    expect(selectAllBtn).toBeDefined();

    // Now set clipboard with an entry
    const pasteSpy = vi.fn();
    useExplorerStore.setState({
      clipboard: {
        mode: "copy",
        entries: [dummyFile],
        sourceAccountId: "acc_local",
        sourceFolderId: "/home/user/Documents",
      },
      pasteClipboard: pasteSpy,
    });

    rerender(
      <ContextMenu
        entry={null}
        x={150}
        y={150}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    const enabledPasteBtn = screen.getByRole("menuitem", { name: /Paste \(1 item\)/i });
    expect(enabledPasteBtn).toBeDefined();
    expect(enabledPasteBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(enabledPasteBtn);
    expect(pasteSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("supports 'Paste into Folder' when right-clicking on a directory", () => {
    const onClose = vi.fn();
    useExplorerStore.setState({
      clipboard: {
        mode: "copy",
        entries: [dummyFile],
        sourceAccountId: "acc_local",
        sourceFolderId: "/home/user/Documents",
      },
    });

    render(
      <ContextMenu
        entry={dummyDir}
        x={120}
        y={120}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    const pasteIntoFolderBtn = screen.getByRole("menuitem", { name: /Paste into Folder/i });
    expect(pasteIntoFolderBtn).toBeDefined();
    expect(pasteIntoFolderBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(pasteIntoFolderBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("scales font size dynamically on context menu container and items", () => {
    // Test with fontSize = 20
    useExplorerStore.setState({ fontSize: 20 });
    const { rerender } = render(
      <ContextMenu
        entry={dummyFile}
        x={100}
        y={100}
        onClose={vi.fn()}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    let menu = screen.getByRole("menu", { name: /File context menu/i });
    expect(menu.style.fontSize).toContain("20px");

    let copyBtn = screen.getByRole("menuitem", { name: /^Copy(?! Path)/i });
    expect(copyBtn.style.fontSize).toContain("20px");

    // Test with fontSize = 11
    useExplorerStore.setState({ fontSize: 11 });
    rerender(
      <ContextMenu
        entry={dummyFile}
        x={100}
        y={100}
        onClose={vi.fn()}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
      />
    );

    menu = screen.getByRole("menu", { name: /File context menu/i });
    expect(menu.style.fontSize).toContain("11px");

    copyBtn = screen.getByRole("menuitem", { name: /^Copy(?! Path)/i });
    expect(copyBtn.style.fontSize).toContain("11px");
  });
});
