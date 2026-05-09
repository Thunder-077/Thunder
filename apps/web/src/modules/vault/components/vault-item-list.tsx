"use client"

import type { VaultItemPlain } from "@thunder/vault"
import { VaultItemCard } from "./vault-item-card"
import { VaultEmptyState } from "./vault-empty-state"

interface VaultItemListProps {
  items: VaultItemPlain[]
  selectedId: string | null
  onSelect: (item: VaultItemPlain) => void
  onEdit: (item: VaultItemPlain) => void
  onDelete: (item: VaultItemPlain) => void
}

export function VaultItemList({
  items,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: VaultItemListProps) {
  if (items.length === 0) {
    return <VaultEmptyState />
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <VaultItemCard
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
