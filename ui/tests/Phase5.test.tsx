import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PreferencesDialog } from "../src/components/PreferencesDialog";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { AccountRecord } from "../src/types";

const mockAccount: AccountRecord = {
  id: "acc_gdrive_vfs",
  provider_type: "google_drive",
  name: "Google Drive Work",
  email: "engineer@company.org",
  root_folder_id: "root_1",
  quota_total: 15 * 1024 * 1024 * 1024,
  quota_used: 5 * 1024 * 1024 * 1024,
  sync_status: "idle",
  mount_path: "/home/user/CloudDrives/Google_Drive_Work",
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe("Phase 5: FUSE Virtual Filesystem & Desktop Integration", () => {
  beforeEach(() => {
    useExplorerStore.setState({
      isPreferencesOpen: false,
      isDefaultFileManager: false,
      accounts: [mockAccount],
      accountMountPaths: {
        acc_gdrive_vfs: "/home/user/CloudDrives/Google_Drive_Work",
      },
    });
  });

  it("checks and sets Default File Manager for inode/directory", async () => {
    const store = useExplorerStore.getState();
    expect(store.isDefaultFileManager).toBe(false);

    // Call setAsDefaultFileManager
    await store.setAsDefaultFileManager();
    expect(useExplorerStore.getState().isDefaultFileManager).toBe(true);
  });

  it("renders Default File Manager toggle and badge in Preferences General tab", async () => {
    useExplorerStore.setState({
      isPreferencesOpen: true,
      isDefaultFileManager: false,
    });

    render(<PreferencesDialog />);

    // General tab is active by default
    expect(screen.getByText("System Integration")).toBeDefined();
    expect(screen.getByText("Default File Manager")).toBeDefined();

    const makeDefaultBtn = screen.getByText("Set as Default");
    expect(makeDefaultBtn).toBeDefined();

    fireEvent.click(makeDefaultBtn);

    await waitFor(() => {
      expect(screen.getByText("Default Manager")).toBeDefined();
    });
  });

  it("manages FUSE virtual mounts in store (mount and unmount)", async () => {
    const store = useExplorerStore.getState();

    // Unmount
    await store.unmountAccountVfs("acc_gdrive_vfs");
    expect(useExplorerStore.getState().accountMountPaths["acc_gdrive_vfs"]).toBeNull();

    // Re-mount
    const path = await store.mountAccountVfs("acc_gdrive_vfs");
    expect(path).toContain("Google_Drive_Work");
    expect(useExplorerStore.getState().accountMountPaths["acc_gdrive_vfs"]).toBe(path);
  });

  it("displays FUSE virtual mount path and unmount button in Preferences Accounts tab", async () => {
    useExplorerStore.setState({
      isPreferencesOpen: true,
      accounts: [mockAccount],
      accountMountPaths: {
        acc_gdrive_vfs: "/home/user/CloudDrives/Google_Drive_Work",
      },
    });

    render(<PreferencesDialog />);

    // Switch to Accounts tab
    const accountsTabBtn = screen.getByText("Accounts");
    fireEvent.click(accountsTabBtn);

    await waitFor(() => {
      expect(screen.getByText("Google Drive Work")).toBeDefined();
      expect(screen.getByText("/home/user/CloudDrives/Google_Drive_Work")).toBeDefined();
      expect(screen.getByText("Unmount")).toBeDefined();
    });

    // Click Unmount
    const unmountBtn = screen.getByText("Unmount");
    fireEvent.click(unmountBtn);

    await waitFor(() => {
      expect(screen.getByText("Mount FUSE")).toBeDefined();
    });
  });
});
