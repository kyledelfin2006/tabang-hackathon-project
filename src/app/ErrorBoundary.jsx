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

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-shell">
          <ErrorState
            title="Recovered application shell"
            message="The shell caught a rendering error. Use reset to return to a safe state."
            actionLabel="Reset shell"
            onAction={this.handleReset}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
