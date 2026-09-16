import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import toast from "react-hot-toast";
import { Mic, Send, Bot, User, PlayCircle, Loader2, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { api } from "../services/api";

type InterviewQuestion = {
  question: string;
  category: string;
  difficulty: string;
};

type InterviewEvaluation = {
  status: "correct" | "mostly_correct" | "partially_correct" | "incorrect" | "insufficient" | "off_topic";
  score: number;
  user_answer: string;
  what_was_correct: string[];
  what_was_missing: string[];
  what_was_incorrect: string[];
  explanation: string;
  ideal_answer: string;
};

type QuestionByQuestionEval = {
  question: string;
  user_answer: string;
  evaluation: string;
  score: number;
  what_was_correct: string[];
  what_was_missing: string[];
  what_was_incorrect: string[];
  ideal_answer: string;
};

type InterviewFinalReport = {
  overall_score: number;
  technical_knowledge: string;
  problem_solving: string;
  communication: string;
  project_understanding: string;
  role_relevance: string;
  strengths: string[];
  areas_for_improvement: string[];
  question_by_question: QuestionByQuestionEval[];
  recommended_next_steps: string[];
};

type TurnData = {
  evaluation?: InterviewEvaluation;
  next_question?: InterviewQuestion;
  final_report?: InterviewFinalReport;
  is_complete: boolean;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content?: string;
  data?: TurnData | { question: InterviewQuestion };
};

export default function MockInterview() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStarted, setIsStarted] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [topic, setTopic] = useState("Data Structures & Algorithms");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  async function startInterview() {
    setIsStarted(true);
    setIsTyping(true);
    const toastId = toast.loading("Setting up mock interview profile and analyzing context...");
    
    try {
      const response = await api.post("/interview/start", { 
        topic: topic,
        source_types: ["resume", "job", "resume_section"]
      });
      
      const newConvId = response.data.conversation_id;
      setConvId(newConvId);

      const aiMsgId = crypto.randomUUID();
      setMessages([{ 
        id: aiMsgId, 
        role: "assistant", 
        data: { question: response.data.next_question } 
      }]);

      toast.success("Interview started!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to start interview", { id: toastId });
      setIsStarted(false);
    } finally {
      setIsTyping(false);
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || !convId || isTyping) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await api.post(`/interview/${convId}/answer`, {
        answer: input
      });

      const aiMsgId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: aiMsgId, role: "assistant", data: response.data }]);

    } catch (err) {
      console.error(err);
      toast.error("Failed to process answer");
    } finally {
      setIsTyping(false);
    }
  }

  function downloadTranscript() {
    const textContent = messages.map(m => {
      if (m.role === 'user') return `Candidate:\n${m.content}`;
      if (m.data?.next_question) return `Interviewer:\n${m.data.next_question.question}`;
      if (m.data?.question) return `Interviewer:\n${m.data.question.question}`;
      return `Interviewer:\n[Final Report Generated]`;
    }).join('\n\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mock_Interview_${topic.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderStatus(status: string) {
    const s = status.toLowerCase();
    if (s.includes("correct") && !s.includes("incorrect") && !s.includes("partially") && !s.includes("mostly")) 
      return <span className="flex items-center text-green-600"><CheckCircle2 className="w-4 h-4 mr-1"/> Correct</span>;
    if (s.includes("partially") || s.includes("mostly")) 
      return <span className="flex items-center text-yellow-600"><AlertCircle className="w-4 h-4 mr-1"/> Partially Correct</span>;
    return <span className="flex items-center text-red-600"><XCircle className="w-4 h-4 mr-1"/> Incorrect / Insufficient</span>;
  }

  return (
    <div className="mx-auto max-w-4xl h-[calc(100vh-8rem)] flex flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">AI Mock Interview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Practice your technical and behavioral skills with an AI interviewer tailored to your background.
        </p>
      </div>

      {!isStarted ? (
        <Card className="flex-1 border-dashed bg-muted/10 shadow-none flex flex-col items-center justify-center p-8 text-center animate-fade-in-up">
          <div className="p-5 bg-primary/10 text-primary rounded-full mb-5">
            <Mic className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-semibold mb-3 text-foreground">Ready for your interview?</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 text-sm">
            The AI will ask you 10 questions based on your resume and chosen topic. Feedback will be provided at the end.
          </p>
          
          <div className="w-full max-w-xs mb-8 text-left">
            <label className="block text-sm font-medium mb-2 text-foreground">Select Interview Topic</label>
            <select 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="Data Structures & Algorithms">Data Structures & Algorithms</option>
              <option value="Web Development">Web Development</option>
              <option value="Artificial Intelligence / ML">Artificial Intelligence / ML</option>
              <option value="System Design">System Design</option>
              <option value="HR / Behavioral">HR / Behavioral</option>
            </select>
          </div>

          <Button onClick={startInterview} className="gap-2">
            <PlayCircle className="w-4 h-4" />
            Start Mock Interview
          </Button>
        </Card>
      ) : (
        <Card className="flex-1 flex flex-col overflow-hidden shadow-sm animate-fade-in-up">
          <CardHeader className="border-b py-3 bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Live Interview: {topic}
                </CardTitle>
              </div>
              
              <div className="bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-full">
                Question {Math.min(messages.filter(m => m.role === 'assistant' && (m.data?.next_question || m.data?.question)).length, 10)} / 10
              </div>
            </div>
            
            <Button variant="outline" size="sm" onClick={downloadTranscript} className="gap-2 h-8 text-xs">
              <Download className="w-3 h-3" />
              Download Transcript
            </Button>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar bg-muted/5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 max-w-[95%] animate-fade-in-up ${
                  msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground border"
                }`}>
                  {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                
                <div className={`flex flex-col space-y-4 ${msg.role === "user" ? "items-end text-right" : "items-start text-left"}`}>
                  {msg.role === "user" && msg.content && (
                    <div className="rounded-xl px-4 py-2.5 bg-primary text-primary-foreground text-[15px] leading-relaxed break-words shadow-sm">
                      {msg.content}
                    </div>
                  )}

                  {msg.role === "assistant" && msg.data?.evaluation && (
                    <div className="border rounded-lg bg-card text-card-foreground shadow-sm w-full max-w-2xl text-sm overflow-hidden">
                      <div className="bg-muted/30 border-b px-4 py-2 font-semibold flex justify-between">
                        <span>Evaluation</span>
                        {renderStatus(msg.data.evaluation.status)}
                      </div>
                      <div className="p-4 space-y-3">
                        <p className="font-medium">Score: {msg.data.evaluation.score}/10</p>
                        {msg.data.evaluation.what_was_correct.length > 0 && (
                          <div>
                            <p className="font-semibold text-green-700">✓ Correct:</p>
                            <ul className="list-disc pl-5 text-muted-foreground">{msg.data.evaluation.what_was_correct.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                          </div>
                        )}
                        {msg.data.evaluation.what_was_missing.length > 0 && (
                          <div>
                            <p className="font-semibold text-yellow-700">⚠ Missing:</p>
                            <ul className="list-disc pl-5 text-muted-foreground">{msg.data.evaluation.what_was_missing.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                          </div>
                        )}
                        {msg.data.evaluation.what_was_incorrect.length > 0 && (
                          <div>
                            <p className="font-semibold text-red-700">✗ Incorrect:</p>
                            <ul className="list-disc pl-5 text-muted-foreground">{msg.data.evaluation.what_was_incorrect.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                          </div>
                        )}
                        <div className="bg-muted/50 p-3 rounded text-xs">
                          <span className="font-semibold block mb-1">Ideal Answer:</span>
                          {msg.data.evaluation.ideal_answer}
                        </div>
                      </div>
                    </div>
                  )}

                  {msg.role === "assistant" && msg.data?.next_question && (
                    <div className="border rounded-lg bg-card text-card-foreground shadow-sm w-full max-w-2xl text-sm overflow-hidden">
                      <div className="bg-primary/5 text-primary border-b px-4 py-2 flex justify-between text-xs font-semibold">
                        <span>Next Question: {msg.data.next_question.category}</span>
                        <span>{msg.data.next_question.difficulty.toUpperCase()}</span>
                      </div>
                      <div className="p-4 text-[15px] leading-relaxed">
                        {msg.data.next_question.question}
                      </div>
                    </div>
                  )}

                  {msg.role === "assistant" && msg.data?.question && (
                    <div className="border rounded-lg bg-card text-card-foreground shadow-sm w-full max-w-2xl text-sm overflow-hidden">
                      <div className="bg-primary/5 text-primary border-b px-4 py-2 flex justify-between text-xs font-semibold">
                        <span>Question 1: {msg.data.question.category}</span>
                        <span>{msg.data.question.difficulty.toUpperCase()}</span>
                      </div>
                      <div className="p-4 text-[15px] leading-relaxed">
                        {msg.data.question.question}
                      </div>
                    </div>
                  )}

                  {msg.role === "assistant" && msg.data?.final_report && (
                    <div className="border-2 border-primary/20 rounded-lg bg-card text-card-foreground shadow-md w-full max-w-2xl text-sm overflow-hidden">
                      <div className="bg-primary text-primary-foreground px-4 py-3 font-semibold text-lg flex justify-between">
                        <span>Final Interview Report</span>
                        <span>Score: {msg.data.final_report.overall_score}/100</span>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <p className="font-bold border-b pb-1 mb-2">Strengths</p>
                          <ul className="list-disc pl-5 text-green-700">{msg.data.final_report.strengths.map((s, idx) => <li key={idx}>{s}</li>)}</ul>
                        </div>
                        <div>
                          <p className="font-bold border-b pb-1 mb-2">Areas for Improvement</p>
                          <ul className="list-disc pl-5 text-red-700">{msg.data.final_report.areas_for_improvement.map((s, idx) => <li key={idx}>{s}</li>)}</ul>
                        </div>
                        <div>
                          <p className="font-bold border-b pb-1 mb-2">Next Steps</p>
                          <ul className="list-disc pl-5 text-muted-foreground">{msg.data.final_report.recommended_next_steps.map((s, idx) => <li key={idx}>{s}</li>)}</ul>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex gap-4 max-w-[80%] animate-fade-in-up">
                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-secondary text-secondary-foreground border flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="bg-muted text-muted-foreground rounded-xl px-4 py-3 rounded-tl-sm text-[15px] flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Evaluating answer...</span>
                </div>
              </div>
            )}
            
            <div ref={bottomRef} />
          </CardContent>
          
          <div className="p-4 bg-background border-t">
            <form onSubmit={sendMessage} className="relative flex items-center">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isTyping ? "Interviewer is typing..." : "Type your answer..."}
                disabled={isTyping || messages[messages.length-1]?.data?.is_complete}
                className="pr-12 py-6 bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary shadow-sm text-[15px]"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || isTyping || messages[messages.length-1]?.data?.is_complete}
                className="absolute right-2 h-9 w-9 rounded-md shadow-sm transition-all hover:scale-105 active:scale-95"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
