"use client"

import { useState } from "react"
import { CheckSquare, Plus, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/empty-state"

interface TodoItem {
  id: string
  text: string
  done: boolean
}

export default function TodoModulePage() {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [input, setInput] = useState("")

  const addTodo = () => {
    const text = input.trim()
    if (!text) return
    setTodos((prev) => [...prev, { id: crypto.randomUUID(), text, done: false }])
    setInput("")
  }

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    )
  }

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div>
      <PageHeader
        title="待办事项"
        description="管理日常任务和待办清单（示例模块）"
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTodo()}
              placeholder="添加新任务..."
              className="h-9 flex-1 rounded-md px-3"
            />
            <Button size="sm" onClick={addTodo} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              添加
            </Button>
          </div>
        </CardContent>
      </Card>

      {todos.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6" />}
          title="暂无待办"
          description="添加你的第一个任务开始使用"
        />
      ) : (
        <div className="mt-4 space-y-2">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <button
                onClick={() => toggleTodo(todo.id)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  todo.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input"
                }`}
              >
                {todo.done && <CheckSquare className="h-3 w-3" />}
              </button>
              <span
                className={`flex-1 text-sm ${
                  todo.done ? "text-muted-foreground line-through" : ""
                }`}
              >
                {todo.text}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => removeTodo(todo.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
