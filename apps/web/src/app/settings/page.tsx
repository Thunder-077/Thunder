"use client"

import { useTheme } from "@/components/theme-provider"
import { PageHeader } from "@/components/page-header"
import { SettingSection } from "@/components/setting-section"
import styles from "./settings.module.css"
import UpdatePanel from "./components/update-panel"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="设置" />

      <SettingSection title="主题">
        <div className={styles.themes}>
          <div
            className={`${styles.theme} ${theme === "light" ? styles.active : ""}`}
            onClick={() => setTheme("light")}
          >
            <div className={styles.preview}>
              <div className={styles.winSidebar} />
              <div className={styles.winBody}>
                <div className={styles.winHeader}>
                  <span className={styles.winTitleBar} />
                  <span className={`${styles.winDot} ${styles.winDotBrand}`} />
                </div>
                <div className={styles.winCard}>
                  <div className={styles.winCardLine} style={{ width: "36%" }} />
                  <div className={styles.winCardLine} style={{ width: "100%" }} />
                  <div className={styles.winCardLine} style={{ width: "45%" }} />
                </div>
              </div>
            </div>
            <div className={styles.label}>
              浅色 <span className={styles.radio}></span>
            </div>
          </div>

          <div
            className={`${styles.theme} ${theme === "dark" ? styles.active : ""}`}
            onClick={() => setTheme("dark")}
          >
            <div className={`${styles.preview} ${styles.dark}`}>
              <div className={styles.winSidebar} />
              <div className={styles.winBody}>
                <div className={styles.winHeader}>
                  <span className={styles.winTitleBar} />
                  <span className={`${styles.winDot} ${styles.winDotBrand}`} />
                </div>
                <div className={styles.winCard}>
                  <div className={styles.winCardLine} style={{ width: "36%" }} />
                  <div className={styles.winCardLine} style={{ width: "100%" }} />
                  <div className={styles.winCardLine} style={{ width: "45%" }} />
                </div>
              </div>
            </div>
            <div className={styles.label}>
              深色 <span className={styles.radio}></span>
            </div>
          </div>

          <div
            className={`${styles.theme} ${theme === "system" ? styles.active : ""}`}
            onClick={() => setTheme("system")}
          >
            <div className={`${styles.preview} ${styles.system}`}>
              <div className={styles.systemLight}>
                <div className={styles.winSidebar} />
                <div className={styles.winBody}>
                  <div className={styles.winHeader}>
                    <span className={styles.winTitleBar} />
                    <span className={`${styles.winDot} ${styles.winDotBrand}`} />
                  </div>
                  <div className={styles.winCard}>
                    <div className={styles.winCardLine} style={{ width: "36%" }} />
                    <div className={styles.winCardLine} style={{ width: "100%" }} />
                    <div className={styles.winCardLine} style={{ width: "45%" }} />
                  </div>
                </div>
              </div>
              <div className={styles.systemDark}>
                <div className={styles.winSidebar} />
                <div className={styles.winBody}>
                  <div className={styles.winHeader}>
                    <span className={styles.winTitleBar} />
                    <span className={`${styles.winDot} ${styles.winDotBrand}`} />
                  </div>
                  <div className={styles.winCard}>
                    <div className={styles.winCardLine} style={{ width: "36%" }} />
                    <div className={styles.winCardLine} style={{ width: "100%" }} />
                    <div className={styles.winCardLine} style={{ width: "45%" }} />
                  </div>
                </div>
              </div>
              <div className={styles.systemDivider} />
            </div>
            <div className={styles.label}>
              跟随系统 <span className={styles.radio}></span>
            </div>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="版本更新">
        <UpdatePanel />
      </SettingSection>
    </div>
  )
}
