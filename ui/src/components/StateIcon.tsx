import React from "react";
import { FileState } from "../types";
import {
  Cloud,
  CheckCircle2,
  Pin,
  ArrowUpCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Minus,
} from "lucide-react";

interface StateIconProps {
  state: FileState;
  size?: number;
  standalone?: boolean;
  isLocal?: boolean;
}

export const StateIcon: React.FC<StateIconProps> = ({
  state,
  size = 14,
  standalone = false,
  isLocal = false,
}) => {
  // Local files and folders are readily available on disk; do not show sync badges
  if (isLocal) {
    return null;
  }
  const baseClass = standalone ? "adw-state-badge" : "adw-state-overlay";

  switch (state) {
    case "cloud_only":
      return (
        <span className={`${baseClass} adw-state-cloud_only`} title="Available in cloud">
          <Cloud size={size} />
        </span>
      );

    case "hydrating":
      return (
        <span className={`${baseClass} adw-state-hydrating`} title="Downloading from cloud...">
          <RefreshCw size={size} className="adw-spin" />
        </span>
      );

    case "available":
      return (
        <span className={`${baseClass} adw-state-available`} title="Downloaded & cached locally">
          <CheckCircle2 size={size} />
        </span>
      );

    case "pinned":
      return (
        <span className={`${baseClass} adw-state-pinned`} title="Always keep on this device">
          <Pin size={size} />
        </span>
      );

    case "syncing_up":
      return (
        <span className={`${baseClass} adw-state-syncing_up`} title="Uploading edits...">
          <ArrowUpCircle size={size} />
        </span>
      );

    case "conflict":
      return (
        <span className={`${baseClass} adw-state-conflict`} title="Conflict detected">
          <AlertTriangle size={size} />
        </span>
      );

    case "error":
      return (
        <span className={`${baseClass} adw-state-error`} title="Sync error">
          <AlertCircle size={size} />
        </span>
      );

    case "excluded":
      return (
        <span className={`${baseClass} adw-state-excluded`} title="Excluded from sync">
          <Minus size={size} />
        </span>
      );

    default:
      return null;
  }
};
