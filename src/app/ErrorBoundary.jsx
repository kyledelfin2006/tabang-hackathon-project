import { Component } from "react";
import ErrorState from "../components/feedback/ErrorState.jsx";
import { PageHeading } from "../components/ui/Primitives.jsx";

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
          <main className="shell__content">
            <PageHeading>This page did not load</PageHeading>
            <ErrorState
              title="Please try again"
              message="Something went wrong before the page could open. Reload to try again. If you need help now, call 911 or open the hotline directory."
              actionLabel="Reload the page"
              onAction={this.handleReload}
            />
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}
