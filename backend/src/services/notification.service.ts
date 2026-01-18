


export class NotificationService {
    static async sendPush(userUuid: string, message: string) {
      console.log("📲 PUSH:", userUuid, message);
    }
  
    static async sendEmail(email: string, subject: string) {
      console.log("📧 EMAIL:", email, subject);
    }
  
    static async alertAdmin(storeUuid: string, message: string) {
      console.log("🚨 ADMIN ALERT:", storeUuid, message);
    }
}
  