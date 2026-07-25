import { memo, useEffect, useState } from "react";
import { useClockStore, type Clock } from "./clock-store";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import {
  ComputerTowerIcon,
  DesktopIcon,
  MoonIcon,
  PlusIcon,
  RepeatIcon,
  SunIcon,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { validators } from "tailwind-merge";

function App() {
  return (
    <main className="h-full p-8 ">
      <NavBar />
      <BigClock />
      <ClockList />
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
  const items = [
    { label: "Light", value: "light", icon: <SunIcon /> },
    { label: "Dark", value: "dark", icon: <MoonIcon /> },
    { label: "System", value: "system", icon: <DesktopIcon /> },
    { label: "Adaptive", value: "adaptive", icon: <RepeatIcon /> },
  ];

  return (
    <Select items={items}>
      <SelectTrigger>
        {/* TODO: render icon */}
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

function Greeting() {
  const now = useNow();
  const hours = now.getHours();
  let greeting: string;

  if (hours >= 4 && hours < 12) {
    greeting = "Good Morning";
  } else if (hours >= 12 && hours < 17) {
    greeting = "Good Afternoon";
  } else if (hours >= 17 && hours < 21) {
    greeting = "Good Evening";
  } else {
    greeting = "Good Night";
  }

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

const TIME_ZONES = Intl.supportedValuesOf("timeZone").map((ianaTimeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaTimeZone,
    timeZoneName: "short",
  }).formatToParts(new Date());

  const [region, city] = ianaTimeZone.split("/", 2);

  return {
    region,
    city: city.replaceAll("_", " "),
    abbreviation: parts.find((part) => part.type === "timeZoneName")?.value,
    ianaTimeZone,
  };
});

function AddClock() {
  const addClock = useClockStore((store) => store.addClock);
  const regionGroups = Object.groupBy(TIME_ZONES, (tz) => tz.region);

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  return (
    <li>
      <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
        <DialogTrigger
          render={
            <Button
              variant="outline"
              className="w-full h-full border-dashed"
              onClick={() => setOpen(true)}
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

          <Command
            value={value}
            onValueChange={(value) => {
              setValue(value);
            }}
          >
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {Object.entries(regionGroups).map(([region, timeZones]) => (
                <CommandGroup key={region} heading={region}>
                  {timeZones?.map((timeZone) => (
                    <CommandItem
                      onSelect={(timeZone) => {
                        console.log("item selected", timeZone);
                        addClock({ id: crypto.randomUUID(), timeZone: timeZone });
                        setOpen(false);
                      }}
                      value={timeZone.ianaTimeZone}
                      keywords={[timeZone.city, timeZone.region, timeZone.ianaTimeZone]}
                      key={timeZone.ianaTimeZone}
                    >
                      {timeZone.city} - {timeZone.abbreviation}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          {/* <Label htmlFor="timezone">Name</Label>
        <Input id="timezone" name="timezone" value={searchText} onChange={e => setSearchText(e.target.value)} /> */}
          {/* <ul className="h-64 overflow-y-scroll">

        </ul> */}
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function BigClock() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const now = useNow();

  return (
    <div className="w-full flex flex-1 justify-center items-center @container ">
      <div className="text-[21cqw] font-mono">{formatter.format(now)}</div>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextTick = () => {
      const currentTime = Date.now();
      const delay = 1000 - (currentTime % 1000);

      timeoutId = setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, delay);
    };

    scheduleNextTick();

    return () => clearTimeout(timeoutId);
  }, []);

  return now;
}

interface ClockProps {
  clock: Clock;
}
const ClockDisplay = memo(function ClockDisplay(props: ClockProps) {
  // const clock = useClockStore(state => state.clockById[props.id])
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    timeZone: props.clock.timeZone,
  });

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: props.clock.timeZone,
  });

  const timezoneFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: props.clock.timeZone,
    timeZoneName: "short",
  });

  const now = useNow();

  const city = props.clock.timeZone.split("/", 2)[1].replace("_", " ");

  const timeZoneName = timezoneFormatter
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;

  // const timezoneAbbreviation =

  return (
    <li>
      <Card>
        <CardHeader className="flex justify-between items-center">
          <CardTitle>{city} </CardTitle>

          <span className="text-muted-foreground">{timeZoneName}</span>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-muted-foreground">{dateFormatter.format(now)}</div>
          <div className="text-3xl font-mono">{timeFormatter.format(now)}</div>
        </CardContent>
      </Card>
    </li>
  );
});

export default App;
