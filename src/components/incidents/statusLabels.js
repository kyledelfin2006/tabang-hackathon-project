export const STATUS_LABEL = Object.freeze({
  new: "Unclaimed",
  acknowledged: "Acknowledged",
  dispatched: "Dispatched",
  on_scene: "On scene",
  resolved: "Resolved",
  cancelled: "Cancelled",
});

export const STATUS_TONE = Object.freeze({
  new: "warning",
  acknowledged: "info",
  dispatched: "info",
  on_scene: "info",
  resolved: "success",
  cancelled: "neutral",
});
