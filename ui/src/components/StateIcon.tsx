import React from "react";
import { FileState } from "../types";
import {
  Cloud,
  CheckCircle2,
  Pin,
  ArrowUpCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Minus,
} from "lucide-react";

interface StateIconProps {
  state: FileState;
  size?: number;
}

export const StateIcon: React.FC<StateIconProps> = ({ state, size = 14 }) => {
  switch (state) {
    case "cloud_only":
      return (
        <span className="adw-state-overlay adw-state-cloud_only" title="Available in cloud">
          <Cloud size={size} />
        </span>
      );

    case "hydrating":
      return (
        <span className="adw-state-overlay adw-state-hydrating" title="Downloading...">
          <Loader2 size={size} className="spin" style={{ animation: "spin 1s linear infinite" }} />
        </span>
      );

    case "available":
      return (
        <span className="adw-state-overlay adw-state-available" title="Cached locally">
          <CheckCircle2 size={size} />
        </span>
      );

    case "pinned":
      return (
        <span className="adw-state-overlay adw-state-pinned" title="Always keep on this device">
          <Pin size={size} />
        </span>
      );

    case "syncing_up":
      return (
        <span className="adw-state-overlay adw-state-syncing_up" title="Uploading edits...">
          <ArrowUpCircle size={size} />
        </span>
      );

    case "conflict":
      return (
        <span className="adw-state-overlay adw-state-conflict" title="Conflict detected">
          <AlertTriangle size={size} />
        </span>
      );

    case "error":
      return (
        <span className="adw-state-overlay adw-state-error" title="Sync error">
          <AlertCircle size={size} />
        </span>
      );

    case "excluded":
      return (
        <span className="adw-state-overlay adw-state-excluded" title="Excluded from sync">
          <Minus size={size} />
        </span>
      );

    default:
      return null;
  }
};
