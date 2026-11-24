// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../src/components/Sidebar";
import { useExplorerStore } from "../src/store/useExplorerStore";

describe("Circular Quota Size Indicator in Sidebar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useExplorerStore.setState({
      accounts: [
        {
          id: "acc_gdrive_test",
          provider_type: "google_drive",
          name: "Google Drive Cloud",
          quota_total: 15 * 1024 * 1024 * 1024, // 15 GB
          quota_used: 6 * 1024 * 1024 * 1024,  // 6 GB (40%)
          sync_status: "idle",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      currentAccountId: null,
      currentFolderId: "/home/user",
    });
  });

  it("renders a 20x20 circular progress indicator to the left of Work Offline and Sync Now buttons", () => {
    render(<Sidebar />);

    // 1. Verify circular progressbar exists with progress info
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toBeDefined();
    expect(progressbar.className).toContain("adw-circular-quota");
    expect(progressbar.getAttribute("aria-valuenow")).toBe("40");
    expect(progressbar.getAttribute("title")).toContain("6.0 GB of 15 GB (40% used)");

    // 2. Verify dimensions match 20x20
    expect(progressbar.style.width).toBe("20px");
    expect(progressbar.style.height).toBe("20px");

    // 3. Verify SVG and circles are present
    const svg = progressbar.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");

    const circles = progressbar.querySelectorAll("circle");
    expect(circles.length).toBe(2); // background track + progress arc

    // 4. Verify button positions: Circular indicator is directly before Work Offline and Sync Now
    const workOfflineBtn = screen.getByTitle("Work Offline");
    const syncNowBtn = screen.getByTitle("Sync Now");

    expect(workOfflineBtn.style.width).toBe("20px");
    expect(workOfflineBtn.style.height).toBe("20px");
    expect(syncNowBtn.style.width).toBe("20px");
    expect(syncNowBtn.style.height).toBe("20px");

    const actionContainer = progressbar.parentElement!;
    const children = Array.from(actionContainer.children);

    const progressbarIndex = children.indexOf(progressbar);
    const workOfflineIndex = children.indexOf(workOfflineBtn);
    const syncNowIndex = children.indexOf(syncNowBtn);

    expect(progressbarIndex).toBeLessThan(workOfflineIndex);
    expect(workOfflineIndex).toBeLessThan(syncNowIndex);
  });
});
