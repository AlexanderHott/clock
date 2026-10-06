import { useEffect, useState } from "react";
import { MeetingPlanner } from "./components/timezone-planner/timezone-planner";
import { useClockStore, type Clock } from "./clock-store";
import { startNowTimer, useNow } from "./now-store";
import {
  getClockFormatters,
  getTimeZoneOption,
  TIME_ZONES,
  toTimeZoneId,
  type TimeZoneId,
} from "./time-zones";
import { useTheme, type Theme } from "./theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { DesktopIcon, MoonIcon, PlusIcon, SunIcon, TrashIcon } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

function App() {
  useEffect(startNowTimer, []);

  return (
    <main className="h-full p-4 sm:p-8 ">
      <NavBar />
      <BigClock />
      <ClockList />
      <MeetingPlanner />
    </main>
  );
}

function NavBar() {
  return (
    <div className="flex justify-between">
      <Greeting />
      <ThemeSelect />
    </div>
  );
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const items: { label: string; value: Theme; icon: React.ReactNode }[] = [
    { label: "Light", value: "light", icon: <SunIcon /> },
    { label: "Dark", value: "dark", icon: <MoonIcon /> },
    { label: "System", value: "system", icon: <DesktopIcon /> },
    // { label: "Adaptive", value: "adaptive", icon: <RepeatIcon /> },
  ];
  const selectedItem = items.find((item) => item.value === theme);

  return (
    <Select
      items={items}
      value={theme}
      onValueChange={(theme) => {
        if (theme) setTheme(theme);
      }}
    >
      <SelectTrigger>
        {selectedItem?.icon}
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.icon} {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function getGreeting(now: number) {
  const hours = new Date(now).getHours();

  if (hours >= 4 && hours < 12) {
    return "Good Morning";
  } else if (hours >= 12 && hours < 17) {
    return "Good Afternoon";
  } else if (hours >= 17 && hours < 21) {
    return "Good Evening";
  } else {
    return "Good Night";
  }
}

function Greeting() {
  const greeting = useNow((state) => getGreeting(state.now));

  return (
    <div className="flex items-center justify-center">
      <div className="text-muted-foreground">{greeting}</div>
    </div>
  );
}

function ClockList() {
  const clocks = useClockStore((store) => store.clocks);

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
      {clocks.map((clock) => (
        <ClockDisplay key={clock.id} clock={clock} />
      ))}
      <AddClock />
    </ul>
  );
}

function AddClock() {
  const addClock = useClockStore((store) => store.addClock);
  const regionGroups = Object.groupBy(TIME_ZONES, (tz) => tz.region);

  const [open, setOpen] = useState(false);

  return (
    <li>
      <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
        <DialogTrigger
          render={
            <Button
              variant="outline"
              className="w-full h-full border-dashed"
              aria-label="Add timezone"
            >
              <PlusIcon className="text-muted-foreground" />
            </Button>
          }
        />
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Time Zone</DialogTitle>
            <DialogDescription>Select the time zone for the new clock.</DialogDescription>
          </DialogHeader>

          <Command>
            <CommandInput placeholder="Search timezones..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {Object.entries(regionGroups).map(([region, timeZones]) => (
                <CommandGroup key={region} heading={region}>
                  {timeZones?.map((timeZone) => (
                    <CommandItem
                      onSelect={(timeZoneId) => {
                        addClock(toTimeZoneId(timeZoneId));
                        setOpen(false);
                      }}
                      value={timeZone.id}
                      keywords={[timeZone.location, timeZone.region, timeZone.id]}
                      key={timeZone.id}
                    >
                      {timeZone.location}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </li>
  );
}

const BIG_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
});

function BigClock() {
  const time = useNow((state) => BIG_CLOCK_FORMATTER.format(state.now));
  return (
    <div className="w-full flex flex-1 justify-center items-center @container ">
      <div className="text-[21cqw] font-mono">{time}</div>
    </div>
  );
}

function ClockTimeZoneName({ timeZone }: { timeZone: TimeZoneId }) {
  const { timeZoneName } = getClockFormatters(timeZone);
  const name = useNow(
    (state) =>
      timeZoneName.formatToParts(state.now).find((part) => part.type === "timeZoneName")?.value,
  );
  return <span className="text-muted-foreground">{name}</span>;
}

function ClockDate({ timeZone }: { timeZone: TimeZoneId }) {
  const { date } = getClockFormatters(timeZone);
  const text = useNow((state) => date.format(state.now));
  return <div className="font-mono text-muted-foreground">{text}</div>;
}

function ClockTime({ timeZone }: { timeZone: TimeZoneId }) {
  const { time } = getClockFormatters(timeZone);
  const text = useNow((state) => time.format(state.now));
  return <div className="text-3xl font-mono">{text}</div>;
}

interface ClockProps {
  clock: Clock;
}
function ClockDisplay({ clock }: ClockProps) {
  const timeZone = getTimeZoneOption(clock.timeZone);
  const removeClock = useClockStore((store) => store.removeClock);

  return (
    <li>
      <Card className="group">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{timeZone.location}</CardTitle>

          <div className="flex items-center">
            <ClockTimeZoneName timeZone={clock.timeZone} />
            <div className="md:w-0 overflow-hidden md:opacity-0 transition-[width,opacity] duration-200 group-hover:w-10 group-hover:opacity-100 group-focus-within:w-10 group-focus-within:opacity-100">
              <Button
                variant="destructive"
                size="icon"
                className="ml-2"
                aria-label={`Delete ${timeZone.location} clock`}
                onClick={() => removeClock(clock.id)}
              >
                <TrashIcon />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ClockDate timeZone={clock.timeZone} />
          <ClockTime timeZone={clock.timeZone} />
        </CardContent>
      </Card>
    </li>
  );
}

export default App;
