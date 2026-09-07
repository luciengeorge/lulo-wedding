import { Heading, Text } from "@react-email/components";

import { Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface WelcomeEmailProps {
  name?: string;
  appName?: string;
}

export default function WelcomeEmail({ name, appName }: WelcomeEmailProps) {
  const display = name?.split(" ")[0] ?? "there";
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";

  return (
    <EmailLayout preview={`Welcome to ${product}`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Welcome, {display}!</Heading>
      <Text className="text-base leading-6 text-gray-700">Thanks for joining {product}. We're glad you're here.</Text>
      <Text className="text-base leading-6 text-gray-700">
        To get the most out of it, here are a few things to try first:
      </Text>
      <Text className="my-2 ml-2 text-base leading-7 text-gray-700">
        • Set up your profile in Settings
        <br />• Explore the dashboard
        <br />• Reply to this email if you get stuck — a real person reads it
      </Text>
      <Signoff />
    </EmailLayout>
  );
}
