# Agent Instructions - Bangumi Sync

## 发布流程关键检查项

### 1. 分支检查

发布前确认当前所在分支：
```bash
git branch --show-current
```

### 2. Release 创建规范

从 `adv` 分支发布时，**必须**使用 `--target adv` 参数：

```bash
gh release create {版本号} \
  ./release/main.js \
  ./release/manifest.json \
  ./release/styles.css \
  --title "v{版本号}" \
  --notes "$(cat <<'EOF'
## 新功能
- xxx

## 改进
- xxx

## 修复
- xxx
EOF
)" \
  --target adv
```

### 3. 常见错误

| 错误做法 | 后果 |
|---------|------|
| 省略 `--target` 参数 | GitHub 默认指向 `main` 分支 |
| Release notes 使用 `\n` 字面量 | Markdown 不会渲染为换行 |
| Tag 带 `v` 前缀 | BRAT 无法正确识别版本 |

### 4. 发布后验证

```bash
# 验证 release 的 target 分支
gh release view {版本号} --json targetCommitish --jq '.targetCommitish'

# 应该输出 adv（如果从 adv 分支发布）
```

### 5. 修复错误的 release

如果发现 release 指向了错误的分支：
```bash
gh release edit {版本号} --target adv
```

## 同步注意事项

详见 [CLAUDE.md](CLAUDE.md) 中的"同步注意事项"部分。
