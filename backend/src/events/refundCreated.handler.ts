

if (isAbusePattern) {
    await PaymentRiskScoreService.increase(
      userUuid,
      30,
      "REFUND_ABUSE"
    );
}