import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateIcon } from "../src/components/StateIcon";
import App from "../src/App";

describe("StateIcon component", () => {
  it("renders cloud_only state badge", () => {
    const { container } = render(<StateIcon state="cloud_only" />);
    expect(container.querySelector(".adw-state-cloud_only")).not.toBeNull();
  });

  it("renders available state badge", () => {
    const { container } = render(<StateIcon state="available" />);
    expect(container.querySelector(".adw-state-available")).not.toBeNull();
  });

  it("renders pinned state badge", () => {
    const { container } = render(<StateIcon state="pinned" />);
    expect(container.querySelector(".adw-state-pinned")).not.toBeNull();
  });

  it("renders hydrating progress ring", () => {
    const { container } = render(<StateIcon state="hydrating" />);
    expect(container.querySelector(".adw-state-hydrating")).not.toBeNull();
  });
});

describe("App component", () => {
  it("renders Nautilus headerbar and sidebar", () => {
    render(<App />);
    expect(screen.getByText("Places")).toBeDefined();
    expect(screen.getByText("Cloud Drives")).toBeDefined();
    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("Documents")).toBeDefined();
  });
});
