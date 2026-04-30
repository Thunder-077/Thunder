export default function AppLoading() {
  return (
    <div className="thunder-splash-screen" aria-label="页面准备中" role="status">
      <div className="thunder-splash-mark">
        {/* Layer the same asset so we can animate glow and lightning flashes independently. */}
        <span className="thunder-splash-glow" aria-hidden="true" />
        <span className="thunder-splash-flash" aria-hidden="true" />
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
