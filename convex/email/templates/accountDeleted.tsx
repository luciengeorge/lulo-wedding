import { Heading, Text } from "@react-email/components";

import { Signoff, supportEmail } from "./_components";
import { EmailLayout } from "./_layout";

interface AccountDeletedEmailProps {
  appName?: string;
}

export default function AccountDeletedEmail({ appName }: AccountDeletedEmailProps) {
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";
  const support = supportEmail();

  return (
    <EmailLayout preview={`Your ${product} account has been deleted`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Account deleted</Heading>
      <Text className="text-base leading-6 text-gray-700">
        Your {product} account and all associated data have been permanently deleted, as requested.
      </Text>
      <Text className="text-base leading-6 text-gray-700">
        We're sorry to see you go. If you didn't request this
        {support ? (
          <>
            , contact us right away at{" "}
            <a href={`mailto:${support}`} className="text-gray-700">
              {support}
            </a>
          </>
        ) : (
          ", contact us right away"
        )}
        .
      </Text>
      <Signoff />
    </EmailLayout>
  );
}
