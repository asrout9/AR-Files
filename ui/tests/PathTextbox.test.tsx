// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeaderBar } from "../src/components/HeaderBar";
import { useExplorerStore } from "../src/store/useExplorerStore";

describe("Path Textbox & Long Path Navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useExplorerStore.setState({
      currentAccountId: null,
      currentFolderId: "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long/Path/Name",
      breadcrumbs: [
        { id: "/home/user", name: "Home" },
        { id: "/home/user/Documents", name: "Documents" },
        { id: "/home/user/Documents/Deeply", name: "Deeply" },
        { id: "/home/user/Documents/Deeply/Nested", name: "Nested" },
        { id: "/home/user/Documents/Deeply/Nested/Project", name: "Project" },
        { id: "/home/user/Documents/Deeply/Nested/Project/Folder", name: "Folder" },
        { id: "/home/user/Documents/Deeply/Nested/Project/Folder/With", name: "With" },
        { id: "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very", name: "Very" },
        { id: "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long", name: "Long" },
        { id: "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long/Path", name: "Path" },
        { id: "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long/Path/Name", name: "Name" },
      ],
      fontSize: 14,
      history: [
        {
          accountId: null,
          folderId: "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long/Path/Name",
          breadcrumbs: [],
        },
      ],
      historyIndex: 0,
      activeJobs: [],
      toast: null,
    });
  });

  it("displays the directory path in an editable textbox by default and fits full long path", () => {
    render(<HeaderBar />);

    const pathInput = screen.getByLabelText("Current directory path") as HTMLInputElement;
    expect(pathInput).toBeDefined();
    expect(pathInput.tagName).toBe("INPUT");
    expect(pathInput.value).toBe(
      "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long/Path/Name"
    );
  });

  it("allows user to manually enter an absolute path and navigate on Enter", () => {
    const navigateSpy = vi.fn();
    useExplorerStore.setState({ navigateTo: navigateSpy });

    render(<HeaderBar />);

    const pathInput = screen.getByLabelText("Current directory path") as HTMLInputElement;

    // Type a new path
    fireEvent.change(pathInput, { target: { value: "/run/media/user/ExternalDrive/Backup" } });
    expect(pathInput.value).toBe("/run/media/user/ExternalDrive/Backup");

    // Submit form (press Enter)
    fireEvent.submit(pathInput.closest("form")!);

    expect(navigateSpy).toHaveBeenCalledWith(
      null,
      "/run/media/user/ExternalDrive/Backup",
      "Backup",
      true
    );
  });

  it("expands tilde paths (e.g. ~/Downloads) when navigating manually", () => {
    const navigateSpy = vi.fn();
    useExplorerStore.setState({ navigateTo: navigateSpy });

    // Mock __USER_HOME__
    (window as any).__USER_HOME__ = "/home/testuser";

    render(<HeaderBar />);

    const pathInput = screen.getByLabelText("Current directory path") as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "~/Downloads/Subfolder" } });
    fireEvent.submit(pathInput.closest("form")!);

    expect(navigateSpy).toHaveBeenCalledWith(
      null,
      "/home/testuser/Downloads/Subfolder",
      "Subfolder",
      true
    );
  });

  it("resolves relative path inputs against current directory", () => {
    const navigateSpy = vi.fn();
    useExplorerStore.setState({
      currentFolderId: "/home/user/Projects",
      navigateTo: navigateSpy,
    });

    render(<HeaderBar />);

    const pathInput = screen.getByLabelText("Current directory path") as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "my-app" } });
    fireEvent.submit(pathInput.closest("form")!);

    expect(navigateSpy).toHaveBeenCalledWith(
      null,
      "/home/user/Projects/my-app",
      "my-app",
      true
    );
  });

  it("copies current path to clipboard and shows toast notification", () => {
    const writeTextSpy = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    });

    render(<HeaderBar />);

    const copyBtn = screen.getByLabelText("Copy path");
    fireEvent.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledWith(
      "/home/user/Documents/Deeply/Nested/Project/Folder/With/Very/Long/Path/Name"
    );
    expect(useExplorerStore.getState().toast?.message).toContain("Copied path:");
  });

  it("allows toggling between textbox mode and breadcrumbs view", () => {
    render(<HeaderBar />);

    // Initially textbox is rendered
    expect(screen.getByLabelText("Current directory path")).toBeDefined();

    // Click toggle to switch to breadcrumbs
    const toggleToBreadcrumbsBtn = screen.getByLabelText("Switch to breadcrumbs view");
    fireEvent.click(toggleToBreadcrumbsBtn);

    // Now breadcrumb pills are visible
    expect(screen.queryByLabelText("Current directory path")).toBeNull();
    expect(screen.getByTitle("Documents")).toBeDefined();
    expect(screen.getByTitle("Nested")).toBeDefined();

    // Click toggle to switch back to textbox
    const toggleToTextboxBtn = screen.getByLabelText("Switch to path textbox");
    fireEvent.click(toggleToTextboxBtn);

    // Textbox is restored
    expect(screen.getByLabelText("Current directory path")).toBeDefined();
  });

  it("focuses and selects the path textbox on Ctrl+L", () => {
    render(<HeaderBar />);

    const pathInput = screen.getByLabelText("Current directory path") as HTMLInputElement;
    const selectSpy = vi.spyOn(pathInput, "select");

    fireEvent.keyDown(window, { key: "l", ctrlKey: true });

    expect(selectSpy).toHaveBeenCalled();
  });
});
