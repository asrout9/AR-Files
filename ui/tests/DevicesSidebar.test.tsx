import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Sidebar } from "../src/components/Sidebar";
import * as ipcModule from "../src/services/ipc";
import { useExplorerStore } from "../src/store/useExplorerStore";

describe("Devices in Sidebar & Auto-Mount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders system devices (Root and Removable Drives) in Sidebar", async () => {
    vi.spyOn(ipcModule, "invokeCommand").mockImplementation(async (cmd: string) => {
      if (cmd === "list_system_devices") {
        return {
          devices: [
            {
              id: "dev_root",
              name: "Fedora Linux (/)",
              mount_path: "/",
              device_type: "root",
              is_removable: false,
              is_mounted: true,
              can_unmount: false,
              can_eject: false,
              total_bytes: 500 * 1024 * 1024 * 1024,
              free_bytes: 400 * 1024 * 1024 * 1024,
            },
            {
              id: "mount_data_drive",
              name: "My Data Drive",
              mount_path: "/run/media/abhi/My Data Drive",
              device_type: "removable",
              is_removable: true,
              is_mounted: true,
              can_unmount: true,
              can_eject: true,
              total_bytes: 500 * 1024 * 1024 * 1024,
              free_bytes: 340 * 1024 * 1024 * 1024,
              device_node: "/dev/sda1",
            },
          ],
        };
      }
      return null;
    });

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("Fedora Linux (/)", { exact: false })).toBeDefined();
      expect(screen.getByText("My Data Drive")).toBeDefined();
    });

    expect(screen.getByText("400.0 GB free")).toBeDefined();
    expect(screen.getByText("340.0 GB free")).toBeDefined();
  });

  it("navigates to the drive when clicked", async () => {
    const navigateToSpy = vi.fn();
    useExplorerStore.setState({ navigateTo: navigateToSpy });

    vi.spyOn(ipcModule, "invokeCommand").mockImplementation(async (cmd: string) => {
      if (cmd === "list_system_devices") {
        return {
          devices: [
            {
              id: "mount_data_drive",
              name: "My Data Drive",
              mount_path: "/run/media/abhi/My Data Drive",
              device_type: "removable",
              is_removable: true,
              is_mounted: true,
              can_unmount: true,
              can_eject: true,
            },
          ],
        };
      }
      return null;
    });

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("My Data Drive")).toBeDefined();
    });

    fireEvent.click(screen.getByText("My Data Drive"));
    expect(navigateToSpy).toHaveBeenCalledWith(null, "/run/media/abhi/My Data Drive", "My Data Drive", true);
  });

  it("calls unmount_device when clicking the eject/unmount button", async () => {
    const invokeSpy = vi.spyOn(ipcModule, "invokeCommand").mockImplementation(async (cmd: string) => {
      if (cmd === "list_system_devices") {
        return {
          devices: [
            {
              id: "mount_data_drive",
              name: "My Data Drive",
              mount_path: "/run/media/abhi/My Data Drive",
              device_type: "removable",
              is_removable: true,
              is_mounted: true,
              can_unmount: true,
              can_eject: true,
              device_node: "/dev/sda1",
            },
          ],
        };
      }
      if (cmd === "unmount_device") {
        return { success: true };
      }
      return null;
    });

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("My Data Drive")).toBeDefined();
    });

    const ejectBtn = screen.getByTitle("Eject device");
    expect(ejectBtn).toBeDefined();
    fireEvent.click(ejectBtn);

    expect(invokeSpy).toHaveBeenCalledWith("unmount_device", {
      mount_path: "/run/media/abhi/My Data Drive",
      device_node: "/dev/sda1",
    });
  });

  it("opens device context menu on right-click with Open, Terminal, and Unmount options", async () => {
    vi.spyOn(ipcModule, "invokeCommand").mockImplementation(async (cmd: string) => {
      if (cmd === "list_system_devices") {
        return {
          devices: [
            {
              id: "mount_data_drive",
              name: "My Data Drive",
              mount_path: "/run/media/abhi/My Data Drive",
              device_type: "removable",
              is_removable: true,
              is_mounted: true,
              can_unmount: true,
              can_eject: true,
              device_node: "/dev/sda1",
            },
          ],
        };
      }
      return null;
    });

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("My Data Drive")).toBeDefined();
    });

    const driveEl = screen.getByText("My Data Drive");
    fireEvent.contextMenu(driveEl, { clientX: 100, clientY: 200 });

    expect(screen.getByRole("menu", { name: /Device context menu/i })).toBeDefined();
    expect(screen.getByText("Open in Terminal")).toBeDefined();
    expect(screen.getByText("Copy Path")).toBeDefined();
    expect(screen.getByText("Unmount")).toBeDefined();
    expect(screen.getByText("Safely Remove / Eject")).toBeDefined();
  });
});
