import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContextMenu } from "../src/components/ContextMenu";
import { CompressToSizeDialog } from "../src/components/CompressToSizeDialog";
import { PreferencesDialog } from "../src/components/PreferencesDialog";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { EntryRecord } from "../src/types";
import * as ipcModule from "../src/services/ipc";

describe("Compress to Desired Size (Image and PDF)", () => {
  const dummyImage: EntryRecord = {
    id: "/home/user/Pictures/photo.jpg",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "photo.jpg",
    path: "/home/user/Pictures/photo.jpg",
    is_directory: false,
    size: 2048000, // 2 MB
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "image/jpeg",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Pictures/photo.jpg",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const dummyPdf: EntryRecord = {
    id: "/home/user/Documents/report.pdf",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "report.pdf",
    path: "/home/user/Documents/report.pdf",
    is_directory: false,
    size: 3145728, // 3 MB
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

  const dummyTextFile: EntryRecord = {
    id: "/home/user/Documents/notes.txt",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "notes.txt",
    path: "/home/user/Documents/notes.txt",
    is_directory: false,
    size: 1024,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "text/plain",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Documents/notes.txt",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const dummyFolder: EntryRecord = {
    id: "/home/user/Pictures",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "Pictures",
    path: "/home/user/Pictures",
    is_directory: true,
    size: 4096,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "inode/directory",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Pictures",
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
      currentFolderId: "/home/user/Pictures",
      breadcrumbs: [{ id: "/home/user", name: "Home" }],
      entries: [dummyImage, dummyPdf, dummyTextFile, dummyFolder],
      selectedIds: new Set(),
    });
  });

  it("shows 'Compress to Desired Size...' option for image files", () => {
    const onCompressToSize = vi.fn();
    const onClose = vi.fn();

    render(
      <ContextMenu
        entry={dummyImage}
        x={100}
        y={100}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
        onCompressToSize={onCompressToSize}
      />
    );

    const btn = screen.getByRole("menuitem", { name: /Compress to Desired Size/i });
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(onCompressToSize).toHaveBeenCalledWith(dummyImage);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows 'Compress to Desired Size...' option for PDF files", () => {
    const onCompressToSize = vi.fn();
    const onClose = vi.fn();

    render(
      <ContextMenu
        entry={dummyPdf}
        x={100}
        y={100}
        onClose={onClose}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
        onCompressToSize={onCompressToSize}
      />
    );

    const btn = screen.getByRole("menuitem", { name: /Compress to Desired Size/i });
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(onCompressToSize).toHaveBeenCalledWith(dummyPdf);
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT show 'Compress to Desired Size...' option for non-image / non-pdf files or directories", () => {
    const onCompressToSize = vi.fn();

    const { rerender } = render(
      <ContextMenu
        entry={dummyTextFile}
        x={100}
        y={100}
        onClose={vi.fn()}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
        onCompressToSize={onCompressToSize}
      />
    );

    expect(screen.queryByRole("menuitem", { name: /Compress to Desired Size/i })).toBeNull();

    rerender(
      <ContextMenu
        entry={dummyFolder}
        x={100}
        y={100}
        onClose={vi.fn()}
        onOpenProperties={vi.fn()}
        onStartRename={vi.fn()}
        onCompressToSize={onCompressToSize}
      />
    );

    expect(screen.queryByRole("menuitem", { name: /Compress to Desired Size/i })).toBeNull();
  });

  it("renders CompressToSizeDialog with file info, presets, and updates preview filename", () => {
    const onClose = vi.fn();

    render(<CompressToSizeDialog entry={dummyImage} onClose={onClose} />);

    expect(screen.getByText("Compress to Desired Size")).toBeDefined();
    expect(screen.getByText("photo.jpg")).toBeDefined();

    // Check presets
    expect(screen.getByRole("button", { name: "100 KB" })).toBeDefined();
    expect(screen.getByRole("button", { name: "300 KB" })).toBeDefined();
    expect(screen.getByRole("button", { name: "500 KB" })).toBeDefined();
    expect(screen.getByRole("button", { name: "1 MB" })).toBeDefined();

    // Click 300 KB preset
    fireEvent.click(screen.getByRole("button", { name: "300 KB" }));

    // Preview should display photo_compressed_300KB.jpg
    expect(screen.getByText("photo_compressed_300KB.jpg")).toBeDefined();

    // Click 100 KB preset
    fireEvent.click(screen.getByRole("button", { name: "100 KB" }));
    expect(screen.getByText("photo_compressed_100KB.jpg")).toBeDefined();
  });

  it("submits compression request with correct parameters and calls onSuccess", async () => {
    const invokeSpy = vi.spyOn(ipcModule, "invokeCommand").mockResolvedValue({
      success: true,
      output_path: "/home/user/Pictures/photo_compressed_300KB.jpg",
      original_size: 2048000,
      compressed_size: 295000,
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CompressToSizeDialog
        entry={dummyImage}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Select 300 KB preset
    fireEvent.click(screen.getByRole("button", { name: "300 KB" }));

    // Click Compress button
    const submitBtn = screen.getByRole("button", { name: /Compress/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("compress_to_size", {
        source_path: "/home/user/Pictures/photo.jpg",
        target_bytes: 300 * 1024,
        formatted_size: "300KB",
        output_path: undefined,
      });
      expect(onSuccess).toHaveBeenCalledWith(
        "/home/user/Pictures/photo_compressed_300KB.jpg",
        295000
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("handles custom size and unit (MB)", async () => {
    const invokeSpy = vi.spyOn(ipcModule, "invokeCommand").mockResolvedValue({
      success: true,
      output_path: "/home/user/Documents/report_compressed_1.5MB.pdf",
      original_size: 1536000,
      compressed_size: 1400000,
    });

    const onClose = vi.fn();

    render(<CompressToSizeDialog entry={dummyPdf} onClose={onClose} />);

    const input = screen.getByLabelText(/Target File Size/i);
    fireEvent.change(input, { target: { value: "1.5" } });

    const unitSelect = screen.getByLabelText(/Unit/i);
    fireEvent.change(unitSelect, { target: { value: "MB" } });

    expect(screen.getByText("report_compressed_1.5MB.pdf")).toBeDefined();

    const submitBtn = screen.getByRole("button", { name: /Compress/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("compress_to_size", {
        source_path: "/home/user/Documents/report.pdf",
        target_bytes: Math.round(1.5 * 1024 * 1024),
        formatted_size: "1.5MB",
        output_path: undefined,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables Compress button and shows warning when target size is larger than current file size", () => {
    // dummyImage is 2,048,000 bytes (approx 1.95 MB)
    render(<CompressToSizeDialog entry={dummyImage} onClose={vi.fn()} />);

    const compressBtn = screen.getByRole("button", { name: /Compress/i }) as HTMLButtonElement;

    // Select 300 KB preset (smaller than 2MB) -> button should be enabled
    fireEvent.click(screen.getByRole("button", { name: "300 KB" }));
    expect(compressBtn.disabled).toBe(false);

    // Select 2 MB preset (2 * 1024 * 1024 = 2,097,152 bytes > 2,048,000 bytes) -> button should be disabled
    fireEvent.click(screen.getByRole("button", { name: "2 MB" }));
    expect(compressBtn.disabled).toBe(true);
    expect(
      screen.getByText(/Target size \(2\.00 MB\) must be smaller than current file size/i)
    ).toBeDefined();

    // Select 5 MB preset (5 * 1024 * 1024 > 2,048,000 bytes) -> button should be disabled
    fireEvent.click(screen.getByRole("button", { name: "5 MB" }));
    expect(compressBtn.disabled).toBe(true);

    // Change custom size input to 100 KB -> button should be enabled again
    const input = screen.getByLabelText(/Target File Size/i);
    fireEvent.change(input, { target: { value: "100" } });
    const unitSelect = screen.getByLabelText(/Unit/i);
    fireEvent.change(unitSelect, { target: { value: "KB" } });
    expect(compressBtn.disabled).toBe(false);

    // Change custom size input to 3000 KB (larger than 2MB) -> button should be disabled
    fireEvent.change(input, { target: { value: "3000" } });
    expect(compressBtn.disabled).toBe(true);
  });
});

describe("App Wide Font Size Setting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useExplorerStore.setState({
      fontSize: 14,
      isPreferencesOpen: true,
      currentAccountId: "acc_local",
      currentFolderId: "/home/user",
      breadcrumbs: [{ id: "/home/user", name: "Home" }],
    });
  });

  it("updates font size in store and applies CSS properties", () => {
    const { setFontSize } = useExplorerStore.getState();
    setFontSize(16);
    expect(useExplorerStore.getState().fontSize).toBe(16);
    expect(document.documentElement.style.getPropertyValue("--app-font-size")).toBe("16px");
    expect(document.documentElement.style.getPropertyValue("--app-font-scale")).toBe("1.143");
  });

  it("renders font size controls in PreferencesDialog and updates on click", () => {
    render(<PreferencesDialog />);

    expect(screen.getByText(/App Font Size/i)).toBeDefined();

    // Click A+ button
    const plusBtn = screen.getByLabelText(/Increase Font Size/i);
    fireEvent.click(plusBtn);
    expect(useExplorerStore.getState().fontSize).toBe(15);

    // Click Large preset (16px)
    const largeBtn = screen.getByRole("button", { name: /Large \(16px\)/i });
    fireEvent.click(largeBtn);
    expect(useExplorerStore.getState().fontSize).toBe(16);
    expect(document.documentElement.style.getPropertyValue("--app-font-size")).toBe("16px");

    // Click Small preset (12px)
    const smallBtn = screen.getByRole("button", { name: /Small \(12px\)/i });
    fireEvent.click(smallBtn);
    expect(useExplorerStore.getState().fontSize).toBe(12);
  });
});
