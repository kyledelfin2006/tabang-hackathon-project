import { Component } from "react";
import ErrorState from "../components/feedback/ErrorState.jsx";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  /*
   * Clearing the error re-renders the same tree that just threw. When the
   * cause is deterministic — a bad build, missing configuration — that
   * re-render throws again instantly and the button appears to do nothing,
   * which is what a resident would report as "the site is broken and the
   * button is dead". A full reload at least refetches the assets, so it can
   * actually fix a stale or partial bundle.
   */
  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-shell">
          <ErrorState
            title="This page did not load"
            message="Something went wrong before the page could open. Reloading may fix it. If it does not, the hotline numbers are printed on the barangay noticeboard — do not wait on this site during an emergency."
            actionLabel="Reload the page"
            onAction={this.handleReload}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
