/** Confirmation recipients and templates are owned by the submission server.
 * Kept as a compatibility export for consumers during endpoint retirement.
 */
export const sendMessengerConfirmation = async (_psid: string, _message: string) => ({
  error: 'Browser Messenger sending has been retired. Confirmations are server-owned.',
});
