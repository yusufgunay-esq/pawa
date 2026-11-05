# Autopilot Anything

## GitHub backup (keep in sync)
- This project is backed up as a PRIVATE GitHub repo under account yusufgunay-esq (remote: origin). The GitHub copy must always match this folder, so work can continue from GitHub if the computer fails.
- After finishing any change (code, docs, work orders, reports), run: git add -A; git commit -m "<short summary>"; git push. Do it at the end of every task, not only at the end of the session.
- Never commit secrets: .env, *.jks, *.keystore, *.pem, key.properties, tokens. Check .gitignore first; if a secret is staged, unstage it.
- Never force-push. If push is rejected: git pull --rebase. If files conflict, stop and tell Yusuf instead of picking a side.
- No origin remote yet? Create it: gh repo create yusufgunay-esq/<name> --private --source . --remote origin --push
