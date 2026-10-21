import { STATUS_LABELS } from "../../services/incidents/incidentLifecycle.js";

export const STATUS_LABEL = STATUS_LABELS;

export const STATUS_TONE = Object.freeze({
  new: "warning",
  acknowledged: "info",
  dispatched: "info",
  on_scene: "info",
  resolved: "success",
  cancelled: "neutral",
});
