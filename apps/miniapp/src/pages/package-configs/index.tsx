import { useEffect, useState } from "react"
import Taro, { useDidShow } from "@tarojs/taro"
import { Button, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { formatMoney } from "@/modules/curtain-quote/services/format"
import { deletePackageConfig, listPackageConfigs } from "@/modules/curtain-quote/services/package-config-storage"
import type { PackageConfig } from "@/modules/curtain-quote/types/quote"
import "./index.css"

export default function PackageConfigsPage() {
  const [configs, setConfigs] = useState<PackageConfig[]>([])

  const loadConfigs = async () => {
    setConfigs(await listPackageConfigs())
  }

  useEffect(() => {
    void loadConfigs()
  }, [])

  useDidShow(() => {
    void loadConfigs()
  })

  const createConfig = () => {
    void Taro.navigateTo({ url: "/pages/package-config-item/index" })
  }

  const editConfig = (id: string) => {
    void Taro.navigateTo({ url: `/pages/package-config-item/index?id=${id}` })
  }

  const removeConfig = async (id: string) => {
    const result = await Taro.showModal({ title: "删除套餐", content: "确认删除该套餐配置？" })
    if (!result.confirm) {
      return
    }

    await deletePackageConfig(id)
    await Taro.showToast({ title: "已删除", icon: "success" })
    await loadConfigs()
  }

  return (
    <PageShell title="套餐配置" showBack paddedBottom>
      <View className="package-configs-page">
        <SectionTitle>已保存套餐</SectionTitle>
        {configs.length === 0 ? (
          <View className="package-configs-empty cq-card">
            <Text className="package-configs-empty__title">暂无套餐配置</Text>
            <Text className="package-configs-empty__desc">先新增套餐，再进行套餐报价。</Text>
            <CurtainButton onClick={createConfig}>新增套餐</CurtainButton>
          </View>
        ) : (
          <View className="package-configs-list">
            {configs.map((config) => (
              <View className="package-configs-card cq-card" key={config.id}>
                <View className="package-configs-card__header">
                  <Text className="package-configs-card__name">{config.name}</Text>
                  <Text className="package-configs-card__price">¥{formatMoney(config.basePrice)}</Text>
                </View>
                <Text className="package-configs-card__line">
                  包含：布 {config.includedFabric}米 / 纱 {config.includedSheer}米 / 轨道 {config.includedTrack}米
                </Text>
                <Text className="package-configs-card__line">
                  超出：布 {config.fabricAddPrice}元/米 / 纱 {config.sheerAddPrice}元/米 / 轨道 {config.trackAddPrice}元/米
                </Text>
                <Text className="package-configs-card__line">
                  退还：布 {config.fabricReducePrice}元/米 / 纱 {config.sheerReducePrice}元/米 / 轨道 {config.trackReducePrice}元/米
                </Text>
                <View className="package-configs-card__actions">
                  <Button className="package-configs-card__action package-configs-card__action--edit" onClick={() => editConfig(config.id)}>
                    编辑
                  </Button>
                  <Button className="package-configs-card__action package-configs-card__action--delete" onClick={() => removeConfig(config.id)}>
                    删除
                  </Button>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      {configs.length > 0 ? (
        <View className="package-configs-footer">
          <CurtainButton onClick={createConfig}>新增套餐</CurtainButton>
        </View>
      ) : null}
    </PageShell>
  )
}
