---
sidebar_position: 2
---

# CLI Commands

Complete command reference.

## package create

Create a .rap package from a folder:

```bash
raisindb package create <folder>
```

Options:
- `--output <file>` - Output file name
- `--no-validate` - Skip validation

## package upload

Upload a package to the server:

```bash
raisindb package upload <file> --repo myapp
```

Options:
- `--server <url>` - Server URL
- `--repo <name>` - Repository name

## package list

List installed packages:

```bash
raisindb package list --repo myapp
```

## package install

Install a package:

```bash
raisindb package install <name> --repo myapp
```

## clone

Download a package:

```bash
raisindb clone <package-name>
```

Options:
- `--output <dir>` - Output directory

## sync

Bidirectional sync with server:

```bash
raisindb sync <directory>
```

Options:
- `--watch` - Watch mode
- `--push` - Push only
- `--pull` - Pull only
- `--dry-run` - Show changes without applying
