// Demo messages for the "Try an example" chips (also used by the test suite).
// Based on common scam patterns reported against trading-platform users in Malaysia.
export const EXAMPLES = [
  {
    label: '🚨 Fake security alert',
    expect: 'scam',
    text: `[Deriv Security Team]
Dear valued client, we detected an unauthorised login to your Deriv account from Jakarta, Indonesia. Your account will be SUSPENDED within 24 hours unless you verify your identity.

Verify now: http://deriv-secure-login.com/verify
Then reply with the 6-digit OTP sent to your phone so our team can confirm it's you.`,
  },
  {
    label: '💸 Withdrawal "fee"',
    expect: 'scam',
    text: `Hi, this is Jessica, your personal Deriv account manager 😊 Congratulations, your profit of USD 4,820 is ready for withdrawal! Due to new Bank Negara regulations you must first pay a 10% clearance tax (USD 482) to unlock the withdrawal. Please transfer USDT (TRC20) to: TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE

Contact me on WhatsApp +60 11-2345 6789 if you have questions. Offer expires today!`,
  },
  {
    label: '🇲🇾 Mesej BM',
    expect: 'scam',
    text: `DERIV MALAYSIA: Akaun anda telah dibekukan kerana aktiviti mencurigakan. Sila hubungi ejen kami di Telegram t.me/deriv_support_my dan bayar yuran pengaktifan RM200 segera untuk aktifkan semula akaun. Amaran terakhir.`,
  },
  {
    label: '✅ Normal notice',
    expect: 'safe',
    text: `Your withdrawal request has been processed. The funds should arrive in your account within 1-3 business days, depending on your payment method. You can check the status anytime by logging in at https://app.deriv.com. For your security, never share your password or one-time codes with anyone — including Deriv staff.`,
  },
];
