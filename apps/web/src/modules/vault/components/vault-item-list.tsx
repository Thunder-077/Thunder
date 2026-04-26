"use client"

import type { VaultItemPlain } from "@thunder/vault"
import { VaultItemCard } from "./vault-item-card"
import { VaultEmptyState } from "./vault-empty-state"

interface VaultItemListProps {
  items: VaultItemPlain[]
  selectedId: string | null
  onSelect: (item: VaultItemPlain) => void
  onCopyUsername: (item: VaultItemPlain) => void
  onCopyPassword: (item: VaultItemPlain) => void
  onEdit: (item: VaultItemPlain) => void
  onDelete: (item: VaultItemPlain) => void
}

export function VaultItemList({
  items,
  selectedId,
  onSelect,
  onCopyUsername,
  onCopyPassword,
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
          onCopyUsername={onCopyUsername}
          onCopyPassword={onCopyPassword}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
