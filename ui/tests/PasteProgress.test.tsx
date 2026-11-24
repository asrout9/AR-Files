// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useExplorerStore } from "../src/store/useExplorerStore";
import * as ipc from "../src/services/ipc";
import { EntryRecord } from "../src/types";

describe("Paste Operation & Progress Indicator", () => {
  const dummyFile1: EntryRecord = {
    id: "/home/user/Documents/file1.txt",
    account_id: "acc_local",
    remote_id: null,
    parent_id: "/home/user/Documents",
    name: "file1.txt",
    path: "/home/user/Documents/file1.txt",
    is_directory: false,
    size: 1024,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "text/plain",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Documents/file1.txt",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const dummyFile2: EntryRecord = {
    id: "/home/user/Documents/file2.txt",
    account_id: "acc_local",
    remote_id: null,
    parent_id: "/home/user/Documents",
    name: "file2.txt",
    path: "/home/user/Documents/file2.txt",
    is_directory: false,
    size: 2048,
    mtime: Date.now(),
    ctime: Date.now(),
    mime_type: "text/plain",
    etag: null,
    content_hash: null,
    state: "available",
    local_path: "/home/user/Documents/file2.txt",
    error_message: null,
    sync_version: 1,
    last_accessed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    useExplorerStore.setState({
      currentAccountId: "acc_local",
      currentFolderId: "/home/user/TargetFolder",
      entries: [],
      clipboard: null,
      activeJobs: [],
      toast: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers an activeJob with running status during copy paste and completes successfully", async () => {
    const invokeSpy = vi.spyOn(ipc, "invokeCommand").mockImplementation(async (cmd, _args) => {
      if (cmd === "copy_entries") {
        return { success: true, copied: ["/home/user/TargetFolder/file1.txt"] };
      }
      return { success: true } as any;
    });

    useExplorerStore.setState({
      clipboard: {
        mode: "copy",
        entries: [dummyFile1],
        sourceAccountId: "acc_local",
        sourceFolderId: "/home/user/Documents",
      },
    });

    const pastePromise = useExplorerStore.getState().pasteClipboard("/home/user/TargetFolder");

    // The active job should be registered and running
    const jobsDuring = useExplorerStore.getState().activeJobs;
    expect(jobsDuring.length).toBe(1);
    expect(jobsDuring[0].type).toBe("copy");
    expect(jobsDuring[0].title).toContain('Copying "file1.txt"');
    expect(jobsDuring[0].totalItems).toBe(1);

    await pastePromise;

    expect(invokeSpy).toHaveBeenCalledWith("copy_entries", {
      entry_ids: ["/home/user/Documents/file1.txt"],
      target_parent_id: "/home/user/TargetFolder",
      collision: "keep_both",
    });

    // Right after paste completes, status should be 'completed'
    const jobsCompleted = useExplorerStore.getState().activeJobs;
    expect(jobsCompleted.length).toBe(1);
    expect(jobsCompleted[0].status).toBe("completed");
    expect(useExplorerStore.getState().toast?.message).toContain('Pasted "file1.txt"');

    // Advance timers past the cleanup delay (1200ms)
    vi.advanceTimersByTime(1500);
    expect(useExplorerStore.getState().activeJobs.length).toBe(0);
  });

  it("handles cut and move paste with progress and clears clipboard", async () => {
    const invokeSpy = vi.spyOn(ipc, "invokeCommand").mockImplementation(async (cmd, _args) => {
      if (cmd === "move_entries") {
        return { success: true, moved: ["/home/user/TargetFolder/file1.txt", "/home/user/TargetFolder/file2.txt"] };
      }
      return { success: true } as any;
    });

    useExplorerStore.setState({
      clipboard: {
        mode: "cut",
        entries: [dummyFile1, dummyFile2],
        sourceAccountId: "acc_local",
        sourceFolderId: "/home/user/Documents",
      },
    });

    const pastePromise = useExplorerStore.getState().pasteClipboard("/home/user/TargetFolder");

    const jobsDuring = useExplorerStore.getState().activeJobs;
    expect(jobsDuring.length).toBe(1);
    expect(jobsDuring[0].type).toBe("move");
    expect(jobsDuring[0].title).toContain("Moving 2 items");
    expect(jobsDuring[0].totalItems).toBe(2);

    await vi.advanceTimersByTimeAsync(100);
    await pastePromise;

    expect(invokeSpy).toHaveBeenCalledWith("move_entries", expect.anything());
    expect(useExplorerStore.getState().clipboard).toBeNull();
    expect(useExplorerStore.getState().toast?.message).toContain("Moved 2 items");

    await vi.advanceTimersByTimeAsync(1500);
    expect(useExplorerStore.getState().activeJobs.length).toBe(0);
  });

  it("marks job as failed and shows toast if invokeCommand fails", async () => {
    vi.spyOn(ipc, "invokeCommand").mockRejectedValue(new Error("Disk is full"));

    useExplorerStore.setState({
      clipboard: {
        mode: "copy",
        entries: [dummyFile1],
        sourceAccountId: "acc_local",
        sourceFolderId: "/home/user/Documents",
      },
    });

    await expect(
      useExplorerStore.getState().pasteClipboard("/home/user/TargetFolder")
    ).rejects.toThrow("Disk is full");

    const jobsFailed = useExplorerStore.getState().activeJobs;
    expect(jobsFailed.length).toBe(1);
    expect(jobsFailed[0].status).toBe("failed");
    expect(useExplorerStore.getState().toast?.message).toBe("Disk is full");

    // Advance timers past the failure cleanup delay (2500ms)
    vi.advanceTimersByTime(3000);
    expect(useExplorerStore.getState().activeJobs.length).toBe(0);
  });
});
