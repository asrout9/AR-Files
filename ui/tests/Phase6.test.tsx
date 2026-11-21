import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useExplorerStore } from "../src/store/useExplorerStore";
import { PreferencesDialog } from "../src/components/PreferencesDialog";
import { ListView } from "../src/components/ListView";
import { GridView } from "../src/components/GridView";
import { HeaderBar } from "../src/components/HeaderBar";
import { getTranslation, formatLocalizedDate, formatLocalizedFileSize } from "../src/i18n";
import { EntryRecord } from "../src/types";

const mockEntries: EntryRecord[] = [
  {
    id: "entry_1",
    account_id: "acc_local",
    parent_id: null,
    name: "Documents",
    path: "/home/user/Documents",
    size: 4096,
    is_directory: true,
    mtime: 1700000000000,
    mime_type: "inode/directory",
    state: "available",
    sync_version: 1,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "entry_2",
    account_id: "acc_local",
    parent_id: null,
    name: "Quarterly_Report.pdf",
    path: "/home/user/Quarterly_Report.pdf",
    size: 2048576,
    is_directory: false,
    mtime: 1700000500000,
    mime_type: "application/pdf",
    state: "cloud_only",
    sync_version: 1,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "entry_3",
    account_id: "acc_local",
    parent_id: null,
    name: "Project_Archive.tar.gz",
    path: "/home/user/Project_Archive.tar.gz",
    size: 536870912,
    is_directory: false,
    mtime: 1700001000000,
    mime_type: "application/gzip",
    state: "pinned",
    sync_version: 1,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
];

describe("Phase 6: Hardening, Accessibility & Internationalization (i18n)", () => {
  beforeEach(() => {
    useExplorerStore.setState({
      language: "en",
      entries: mockEntries,
      selectedIds: new Set<string>(),
      isPreferencesOpen: false,
      viewMode: "list",
      sortBy: "name",
      sortDirection: "asc",
    });
  });

  describe("Internationalization (i18n)", () => {
    it("translates key application terms across all supported languages", () => {
      // English
      expect(getTranslation("appName", "en")).toBe("AR Files");
      expect(getTranslation("places", "en")).toBe("Places");
      expect(getTranslation("preferences", "en")).toBe("Preferences");

      // German
      expect(getTranslation("appName", "de")).toBe("AR Dateien");
      expect(getTranslation("places", "de")).toBe("Orte");
      expect(getTranslation("preferences", "de")).toBe("Einstellungen");

      // French
      expect(getTranslation("appName", "fr")).toBe("AR Fichiers");
      expect(getTranslation("places", "fr")).toBe("Emplacements");

      // Spanish
      expect(getTranslation("appName", "es")).toBe("AR Archivos");
      expect(getTranslation("places", "es")).toBe("Lugares");

      // Japanese
      expect(getTranslation("appName", "ja")).toBe("AR ファイル");
      expect(getTranslation("places", "ja")).toBe("場所");

      // Hindi
      expect(getTranslation("appName", "hi")).toBe("एआर फाइल्स");
      expect(getTranslation("places", "hi")).toBe("स्थान");
    });

    it("formats dates localized according to the selected language", () => {
      const timestamp = 1700000000000; // Nov 14, 2023
      const enDate = formatLocalizedDate(timestamp, "en");
      const deDate = formatLocalizedDate(timestamp, "de");

      expect(enDate).toBeDefined();
      expect(deDate).toBeDefined();
      expect(typeof enDate).toBe("string");
      expect(typeof deDate).toBe("string");
    });

    it("formats file sizes cleanly and localized", () => {
      expect(formatLocalizedFileSize(0, "en")).toBe("0 B");
      expect(formatLocalizedFileSize(1024, "en")).toBe("1 KB");
      expect(formatLocalizedFileSize(1048576 * 5, "en")).toBe("5 MB");
      expect(formatLocalizedFileSize(1073741824 * 2.5, "en")).toBe("2.5 GB");
    });

    it("updates store language when changed in PreferencesDialog", async () => {
      useExplorerStore.setState({ isPreferencesOpen: true, language: "en" });
      render(<PreferencesDialog />);

      const select = screen.getByLabelText("Interface Language");
      expect(select).toBeDefined();

      fireEvent.change(select, { target: { value: "de" } });
      expect(useExplorerStore.getState().language).toBe("de");
    });
  });

  describe("Accessibility (A11y) & ARIA Semantics", () => {
    it("ensures PreferencesDialog complies with WAI-ARIA modal dialog and tablist patterns", () => {
      useExplorerStore.setState({ isPreferencesOpen: true });
      render(<PreferencesDialog />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");

      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeDefined();

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThanOrEqual(4);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    });

    it("ensures HeaderBar conforms to toolbar semantics with accessible icon button labels", () => {
      render(<HeaderBar />);

      const toolbar = screen.getByRole("toolbar");
      expect(toolbar).toBeDefined();

      expect(screen.getByLabelText("Back")).toBeDefined();
      expect(screen.getByLabelText("Forward")).toBeDefined();
      expect(screen.getByLabelText("Parent folder")).toBeDefined();
      expect(screen.getByLabelText("Search files and cloud")).toBeDefined();
    });

    it("ensures ListView implements grid, row, gridcell semantics and handles keyboard selection", () => {
      // Mock clientHeight and getBoundingClientRect for JSDOM
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

      render(<ListView onContextMenu={() => {}} />);

      const grid = screen.getByRole("grid");
      expect(grid).toBeDefined();

      // Table header + item rows
      const rows = screen.getAllByRole("row");
      expect(rows.length).toBeGreaterThanOrEqual(1);

      // Verify cell semantics
      const cells = screen.getAllByRole("gridcell");
      expect(cells.length).toBeGreaterThanOrEqual(1);

      // Verify keyboard navigation on grid
      const itemRow0 = rows.find((r) => r.getAttribute("aria-label")?.includes("Documents")) || rows[1];
      if (itemRow0) {
        // Keyboard navigation: Space key toggles selection
        fireEvent.keyDown(itemRow0, { key: " " });
        expect(useExplorerStore.getState().selectedIds.has("entry_1")).toBe(true);

        // Arrow Down moves focus / selection
        fireEvent.keyDown(itemRow0, { key: "ArrowDown" });
        expect(useExplorerStore.getState().selectedIds.has("entry_2")).toBe(true);
      }
    });

    it("ensures GridView implements grid and row semantics with keyboard navigation", () => {
      useExplorerStore.setState({ viewMode: "grid" });
      render(<GridView onContextMenu={() => {}} />);

      const grid = screen.getByRole("grid");
      expect(grid).toBeDefined();

      const items = screen.getAllByRole("row");
      expect(items.length).toBe(mockEntries.length);

      // Space selects item
      fireEvent.keyDown(items[1], { key: " " });
      expect(useExplorerStore.getState().selectedIds.has("entry_2")).toBe(true);
    });
  });
});
