# wishd pitch — recording day checklist

## Environment

- [ ] Fresh Chrome profile, no extensions, no notifications
- [ ] 1920×1080 viewport (DevTools device toolbar OFF, window sized via window.resizeTo or browser native)
- [ ] Cursor highlight extension installed but **OFF for slides**, **ON for demo**
- [ ] Mic test (USB or Lavalier; not laptop built-in)
- [ ] DnD on, all chat apps quit
- [ ] Charger plugged in (no battery saver throttling)

## App build for live demo

- [ ] `cd apps/web && next build && next start` (no Next.js dev overlay)
- [ ] Demo runs against `wishd.sumula.online` (production deploy) — confirm latest commit deployed
- [ ] Porto wallet on Sepolia, prefunded: ETH for gas + USDC ≥ 50 (faucet from `faucet.circle.com`)
- [ ] Compound v3 USDC market on Sepolia reachable
- [ ] `auto-compound-comp` keeper renders with sensible cron + nodes after deploy
- [ ] Free-text parser tested for `swap 0.001 eth for usdc on sepolia` AND `lend 50 usdc on compound` — both produce all required pills

## Browser tabs

- [ ] Tab 1: `experiments/pitch-deck/index.html` (the deck)
- [ ] Tab 2: `wishd.sumula.online` (the app, logged in to Porto)
- [ ] Tab 3: `app.keeperhub.com` (logged in, same account demo deploys to — for beat 4 proof shot)

## Recording flow

1. Tab 1 — slide 1 voiceover, → after speech
2. Slide 2 voiceover, →
3. Slide 3 voiceover ending "Let me show you" → cmd-tab to Tab 2
4. **Live demo (60s)** per `docs/superpowers/specs/2026-05-02-demo-script-design.md` beats 1–5
5. cmd-tab back to Tab 1 → → for slide 4
6. Slide 4 voiceover, →
7. Slide 5 voiceover, →
8. Slide 6 voiceover, →
9. Slide 7 voiceover

## Retake budget

- Slides 1–7: unlimited (cheap)
- Live demo: max 3 retakes; if all 3 fail, drop to spec option B (one wish + keeper)

## Post

- [ ] Cut single takes into master timeline
- [ ] Add 0.5s silence between slide cuts
- [ ] Demo segment unedited unless retake; preserve real-time agent streaming
- [ ] Export H.264 1080p, ≤200MB if possible (ETHGlobal upload limits vary)
