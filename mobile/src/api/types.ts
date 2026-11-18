// Типы ответов API Sabyr (источник истины — backend/intervention/services.py: present_transfer).
export type Lang = 'kz' | 'ru';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TransferStatus = 'allowed' | 'warned' | 'cooldown' | 'confirmed' | 'cancelled' | 'declined';
export type TransferAction = 'allow' | 'warn' | 'cooldown';

export type DemoUser = { id: number; full_name: string; age: number; lang: Lang; bank: string };

export type Client = {
  id: number;
  full_name: string;
  age: number;
  lang: Lang;
  phone: string;
  bank: { code: string; name: string };
  account: { number: string; balance: string } | null;
  trusted_contact: { name: string; relation: string; phone: string } | null;
  trusted_for: string[];
};

export type Reason = { code: string; text: string; ru?: string; kz?: string; source?: 'llm' | 'partial' | 'template' };
export type Scheme = { code: string; title: string; how: string };
export type Recipient = { account: string; name: string; bank: string };
export type TrustedRequestBrief = { id: number; status: 'pending' | 'approved' | 'declined'; trusted_name: string };
export type Blocker = { code: string; message: string; seconds_left?: number };

export type LedgerFlag = {
  reason?: string;
  bank?: string;
  bank_name?: string;
  bank_code?: string;
  flagged_by?: string;
  [key: string]: unknown;
};
export type LedgerInfo = { status: string; flagged: boolean; account_hash?: string; flags: LedgerFlag[] };

export type TransferState = {
  transfer_id: string;
  status: TransferStatus;
  amount: string;
  created_at: string;
  recipient: Recipient;
  risk: {
    score: number;
    level: RiskLevel;
    sender_score: number | null;
    recipient_score: number | null;
    reasons: Reason[];
    scheme: Scheme | null;
  };
  action: TransferAction;
  cooldown_until: string | null;
  cooldown_seconds_left: number;
  trusted_request: TrustedRequestBrief | null;
  assistant_turns: number;
  can_confirm: boolean;
  blockers: Blocker[];
  ledger?: LedgerInfo;
};

export type HistoryItem = {
  transfer_id: string;
  direction: 'in' | 'out';
  amount: string;
  status: TransferStatus;
  created_at: string;
  counterparty: { account: string; name: string };
  risk_score: number | null;
  risk_level: RiskLevel | '';
};

export type IncomingRequest = {
  id: number;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  responded_at: string | null;
  transfer: {
    transfer_id: string;
    status: TransferStatus;
    amount: string;
    sender_name: string;
    recipient: Recipient;
    risk_score: number;
    risk_level: RiskLevel;
    reasons: Reason[];
    scheme: Scheme | null;
    signals: { on_call: boolean; screen_share: boolean };
  };
};

export type ChatMessage = { role: 'assistant' | 'user'; text: string; created_at?: string };

export type AssistantResponse = {
  transfer_id: string;
  messages: ChatMessage[];
  reply: ChatMessage | null;
  turn: number;
  max_turns: number;
  done: boolean;
  provider: 'anthropic' | 'own' | 'static' | string;
  degraded: boolean;
  can_confirm: boolean;
};
