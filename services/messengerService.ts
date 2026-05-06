import { supabase } from './supabaseClient';

/**
 * Sends a confirmation message to a customer on Facebook Messenger via Supabase Edge Function
 * @param psid The Page-Scoped ID of the user
 * @param message The message text to send
 * @returns Promise with the API response
 */
export const sendMessengerConfirmation = async (psid: string, message: string): Promise<any> => {
  if (!psid || psid === 'default-user') {
    console.warn('Invalid PSID provided for Messenger confirmation:', psid);
    return { error: 'Invalid PSID' };
  }

  try {
    console.log(`Invoking send-messenger-message edge function for PSID: ${psid}`);
    const { data, error } = await supabase.functions.invoke('send-messenger-message', {
      body: { psid, message }
    });

    if (error) {
      console.error('Error returned from send-messenger-message edge function:', error);
      return { error: error.message || 'Failed to invoke edge function' };
    }

    console.log('Messenger confirmation sent successfully via edge function:', data);
    return data;
  } catch (error) {
    console.error('Exception when invoking send-messenger-message edge function:', error);
    return { error };
  }
};
