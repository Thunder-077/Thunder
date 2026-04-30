export default function AppLoading() {
  return (
    <div className="thunder-splash-screen thunder-route-loading" aria-label="页面准备中" role="status">
      <div className="thunder-splash-mark">
        <span className="thunder-splash-glow" aria-hidden="true" />
        <img
          src="/logo.png"
          alt="Thunder"
          className="thunder-splash-logo"
          draggable="false"
        />
      </div>
    </div>
  )
}
