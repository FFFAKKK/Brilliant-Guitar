import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";

interface Props {
  readonly componentId: string;
  readonly resetKey: string;
  readonly onIssue?: (issue: WorkbenchIssue) => void;
  readonly children: ReactNode;
}

interface State { readonly failed: boolean }

export class UiComponentErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    const message = `组件 ${this.props.componentId} 暂时无法显示`;
    this.props.onIssue?.({ code: "component.render-failed", message, severity: "error", source: "renderer",
      target: { scope: "component", componentId: this.props.componentId }, retryable: true });
    if (import.meta.env.DEV) console.error(message, error);
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="ui-component-failure" role="alert" aria-label={`${this.props.componentId} 加载失败`}>
      <span aria-hidden="true">!</span>
      <button type="button" aria-label="重新加载组件" title="重新加载组件"
        onClick={() => this.setState({ failed: false })}>↻</button>
    </div>;
  }
}
