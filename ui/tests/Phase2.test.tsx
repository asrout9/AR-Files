import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchRenameDialog } from "../src/components/BatchRenameDialog";
import { ConflictDialog } from "../src/components/ConflictDialog";
import { ProgressPopover, ActiveJob } from "../src/components/ProgressPopover";
import { EntryRecord } from "../src/types";

const mockEntries: EntryRecord[] = [
  {
    id: "e1",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "photo_summer.jpg",
    path: "/home/user/photo_summer.jpg",
    is_directory: false,
    size: 2048576,
    mtime: 1700000000000,
    ctime: 1700000000000,
    mime_type: "image/jpeg",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/photo_summer.jpg",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "e2",
    account_id: "acc_local",
    remote_id: null,
    parent_id: null,
    name: "photo_winter.jpg",
    path: "/home/user/photo_winter.jpg",
    is_directory: false,
    size: 4096000,
    mtime: 1700000050000,
    ctime: 1700000050000,
    mime_type: "image/jpeg",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/photo_winter.jpg",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: 1700000050000,
    updated_at: 1700000050000,
  },
];

describe("Phase 2: Operations Engine UI Components", () => {
  it("renders BatchRenameDialog and generates live rename previews", () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    render(
      <BatchRenameDialog
        entries={mockEntries}
        onClose={handleClose}
        onApply={handleApply}
      />
    );

    expect(screen.getByText(/Batch Rename \(2 items\)/i)).toBeDefined();
    expect(screen.getAllByText("photo_summer.jpg").length).toBe(2);
    expect(screen.getAllByText("photo_winter.jpg").length).toBe(2);

    // Type find and replace
    const findInput = screen.getByPlaceholderText("e.g. photo");
    const replaceInput = screen.getByPlaceholderText("e.g. vacation");

    fireEvent.change(findInput, { target: { value: "photo" } });
    fireEvent.change(replaceInput, { target: { value: "vacation" } });

    // Verify preview updated
    expect(screen.getByText("vacation_summer.jpg")).toBeDefined();
    expect(screen.getByText("vacation_winter.jpg")).toBeDefined();

    // Click Apply
    const applyButton = screen.getByRole("button", { name: /Rename 2 items/i });
    fireEvent.click(applyButton);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply).toHaveBeenCalledWith([
      { id: "e1", oldName: "photo_summer.jpg", newName: "vacation_summer.jpg" },
      { id: "e2", oldName: "photo_winter.jpg", newName: "vacation_winter.jpg" },
    ]);
  });

  it("renders ConflictDialog and handles resolution actions", () => {
    const handleResolve = vi.fn();
    const handleCancel = vi.fn();

    const existingEntry: EntryRecord = {
      ...mockEntries[0],
      name: "photo_summer.jpg",
      size: 5000000,
      mtime: 1700005000000,
    };

    render(
      <ConflictDialog
        sourceEntry={mockEntries[0]}
        existingEntry={existingEntry}
        onResolve={handleResolve}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText(/File Conflict Detected/i)).toBeDefined();
    expect(screen.getByText(/"photo_summer.jpg"/i)).toBeDefined();

    // Click 'Keep Both'
    const keepBothBtn = screen.getByRole("button", { name: /Keep Both/i });
    fireEvent.click(keepBothBtn);

    expect(handleResolve).toHaveBeenCalledWith("keep_both", false);
  });

  it("renders ProgressPopover and shows active job progress and cancelation", () => {
    const handleCancel = vi.fn();
    const handleClose = vi.fn();

    const jobs: ActiveJob[] = [
      {
        id: "job_copy_1",
        type: "copy",
        title: "Copying 10 files",
        itemsCompleted: 5,
        totalItems: 10,
        bytesProcessed: 50000000,
        totalBytes: 100000000,
        speedBps: 25000000,
        etaSeconds: 2,
        status: "running",
      },
    ];

    render(
      <ProgressPopover
        jobs={jobs}
        onCancelJob={handleCancel}
        onClose={handleClose}
      />
    );

    expect(screen.getByText(/File Operations/i)).toBeDefined();
    expect(screen.getByText("Copying 10 files")).toBeDefined();
    expect(screen.getByText(/5 of 10 items/i)).toBeDefined();
    expect(screen.getByText(/23.8 MB\/s/i)).toBeDefined();
    expect(screen.getByText(/ETA 2s/i)).toBeDefined();

    // Click cancel
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(handleCancel).toHaveBeenCalledWith("job_copy_1");
  });
});
