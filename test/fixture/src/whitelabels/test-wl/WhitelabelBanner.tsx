import React from 'react'
// only exists under `src/` — resolves because the swap keeps the original module id
import { bannerText } from './bannerText'

const WhitelabelBanner = () => <p data-testid="wl-banner">overridden by test-wl ({bannerText})</p>

export default WhitelabelBanner
