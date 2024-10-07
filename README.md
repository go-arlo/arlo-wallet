# Arlo Multisig Wallet SDK

![Project Status](https://img.shields.io/badge/status-draft-orange)

> 🚧 This project is currently in draft mode and not ready for use. Expect breaking changes. 🚧

An open-source TypeScript SDK for creating multi-signature wallets on Solana that support AI agents as signatories. This SDK allows for flexible integration with AI agents from various frameworks and provides robust features for transaction approvals, budget allocations, and customizable thresholds for AI and human signatories.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Setup](#setup)
  - [Creating a Multisig Wallet](#creating-a-multisig-wallet)
  - [Allocating AI Budget](#allocating-ai-budget)
  - [Setting Approval Logic](#setting-approval-logic)
  - [Proposing Transactions](#proposing-transactions)
  - [Signing Transactions](#signing-transactions)
- [Integration with AI Agents](#integration-with-ai-agents)
- [Testing](#testing)
- [Publishing the SDK](#publishing-the-sdk)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Features

- **AI Agent Integration**: Seamless support for AI agents as signatories.
- **Budget Allocation**: Allocate specific budget amounts for AI agents.
- **Customizable Thresholds**: Set minimum signatures required for transaction approval.
- **Signatory Labeling**: Label signatories as AI agents or humans.
- **Dynamic Approval Logic**: Change thresholds based on transaction amounts and budgets.
- **Mainnet and Devnet Support**: Test and deploy on both Solana mainnet and devnet.

---

## Installation

```bash
npm install arlo-multisig-sdk
