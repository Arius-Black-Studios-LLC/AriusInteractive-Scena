import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useSearchParams,
} from "react-router-dom";
import { LoginModal } from "./components/LoginModal";
import { SiteHeader } from "./components/SiteHeader";
import { AuthProvider } from "./context/AuthContext";
import { AccountPage } from "./pages/AccountPage";
import { BlogPage } from "./pages/BlogPage";
import { HomePage } from "./pages/HomePage";
import { LearnLayout } from "./pages/learn/LearnLayout";
import { LearnCatalogPage } from "./pages/learn/LearnCatalogPage";
import { LearnLessonPage } from "./pages/learn/LearnLessonPage";
import { PlayPage } from "./pages/PlayPage";
import { SeriesPage } from "./pages/SeriesPage";
import { StaticPage } from "./pages/StaticPage";
import { StudioPage } from "./pages/StudioPage";
import "./App.css";

function ShellLayout() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    if (params.get("login")) setLoginOpen(true);
  }, [params]);

  const loginTarget = params.get("login");
  const postLogin =
    loginTarget === "studio"
      ? "/studio"
      : loginTarget === "account"
        ? "/account"
        : undefined;

  return (
    <>
      <SiteHeader onOpenLogin={() => setLoginOpen(true)} />
      <Outlet />
      <footer className="site-footer">
        <div className="container site-footer-inner">
          <span>Arleco · indie visual novels</span>
          <Link to="/help">Help</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </footer>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} postLogin={postLogin} />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/help" element={<StaticPage page="help" />} />
        <Route path="/about" element={<StaticPage page="about" />} />
        <Route path="/contact" element={<StaticPage page="contact" />} />
        <Route path="/privacy" element={<StaticPage page="privacy" />} />
        <Route path="/terms" element={<StaticPage page="terms" />} />
        <Route path="/content-guidelines" element={<StaticPage page="content-guidelines" />} />
        <Route path="/series" element={<SeriesPage />} />
      </Route>
      <Route path="/play" element={<PlayPage />} />
      <Route path="/studio/*" element={<StudioPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/learn" element={<LearnLayout />}>
        <Route index element={<LearnCatalogPage />} />
        <Route path=":lessonId" element={<LearnLessonPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-shell">
          <AppRoutes />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
