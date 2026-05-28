import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => this.setState({ hasError: false, error: undefined })

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-red-500 font-medium mb-2">Something went wrong</p>
            <p className="text-sm text-gray-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={this.handleReset}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
