import { Component, lazy, ReactNode, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import Start from "./screens/Start";

const S = {
  Flow: lazy(() => import("./screens/Flow")),
  News: lazy(() => import("./screens/News")),
  Music: lazy(() => import("./screens/Music")),
  Batch: lazy(() => import("./screens/Batch")),
  Looks: lazy(() => import("./screens/Looks")),
  Dashboard: lazy(() => import("./screens/Dashboard")),
  Projects: lazy(() => import("./screens/Projects")),
  MediaImport: lazy(() => import("./screens/MediaImport")),
  VideoAnalyzer: lazy(() => import("./screens/VideoAnalyzer")),
  ProductBrain: lazy(() => import("./screens/ProductBrain")),
  Strategy: lazy(() => import("./screens/Strategy")),
  Matrix: lazy(() => import("./screens/Matrix")),
  ScriptStudio: lazy(() => import("./screens/ScriptStudio")),
  Storyboard: lazy(() => import("./screens/Storyboard")),
  VoiceStudio: lazy(() => import("./screens/VoiceStudio")),
  Templates: lazy(() => import("./screens/Templates")),
  Editor: lazy(() => import("./screens/Editor")),
  Motion: lazy(() => import("./screens/Motion")),
  Subtitles: lazy(() => import("./screens/Subtitles")),
  BatchSetup: lazy(() => import("./screens/BatchSetup")),
  RenderQueue: lazy(() => import("./screens/RenderQueue")),
  QualityReview: lazy(() => import("./screens/QualityReview")),
  BatchReview: lazy(() => import("./screens/BatchReview")),
  Library: lazy(() => import("./screens/Library")),
  Analytics: lazy(() => import("./screens/Analytics")),
  Settings: lazy(() => import("./screens/Settings")),
  Hardware: lazy(() => import("./screens/Hardware")),
  Models: lazy(() => import("./screens/Models")),
  BrandKit: lazy(() => import("./screens/BrandKit")),
};

export const ROUTES: Array<[string, keyof typeof S]> = [
  ["/flow", "Flow"],
  ["/news", "News"],
  ["/music", "Music"],
  ["/batch", "Batch"],
  ["/looks", "Looks"],
  ["/overview", "Dashboard"],
  ["/projects", "Projects"],
  ["/media", "MediaImport"],
  ["/media/analyze", "VideoAnalyzer"],
  ["/brain", "ProductBrain"],
  ["/creative/strategy", "Strategy"],
  ["/creative/matrix", "Matrix"],
  ["/creative/scripts", "ScriptStudio"],
  ["/creative/storyboard", "Storyboard"],
  ["/creative/voice", "VoiceStudio"],
  ["/creative/templates", "Templates"],
  ["/production/editor", "Editor"],
  ["/production/motion", "Motion"],
  ["/production/subtitles", "Subtitles"],
  ["/production/batch", "BatchSetup"],
  ["/production/queue", "RenderQueue"],
  ["/review/qc", "QualityReview"],
  ["/review/batch", "BatchReview"],
  ["/library", "Library"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
  ["/system/hardware", "Hardware"],
  ["/system/models", "Models"],
  ["/system/brand", "BrandKit"],
];

/** Một màn lỗi thì chỉ màn đó báo lỗi, không trắng cả app. */
class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="card" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <div className="bold" style={{ fontSize: 18 }}>Màn hình này gặp lỗi</div>
        <div className="small t2 mt8">Dữ liệu của bạn vẫn còn nguyên. Bấm tải lại để tiếp tục.</div>
        <div className="xs muted mt8" style={{ wordBreak: "break-word" }}>{String(this.state.err.message || this.state.err)}</div>
        <button className="btn primary mt16" onClick={() => window.location.reload()}>Tải lại</button>
      </div>
    );
  }
}

export default function App() {
  return (
    <Layout>
      <ErrorBoundary>
      <Suspense fallback={<Loading rows={5} h={22} />}>
        <Routes>
          <Route path="/" element={<Start />} />
          {ROUTES.map(([path, name]) => {
            const C = S[name];
            return <Route key={path} path={path} element={<C />} />;
          })}
          <Route path="*" element={<Start />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
