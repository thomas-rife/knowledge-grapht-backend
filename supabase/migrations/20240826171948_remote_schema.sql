SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."class_knowledge_graph" (
    "class_id" bigint,
    "graph_id" bigint NOT NULL,
    "nodes" character varying(100)[],
    "edges" character varying(100)[],
    "react_flow_data" "jsonb"[]
);
ALTER TABLE "public"."class_knowledge_graph" OWNER TO "postgres";
ALTER TABLE "public"."class_knowledge_graph" ALTER COLUMN "graph_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."class_knowledge_graph_graph_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."class_lesson_bank" (
    "owner_id" "uuid" NOT NULL,
    "lesson_id" bigint NOT NULL,
    "class_id" bigint NOT NULL
);
ALTER TABLE "public"."class_lesson_bank" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."class_question_bank" (
    "owner_id" "uuid" NOT NULL,
    "class_id" bigint NOT NULL,
    "question_id" bigint NOT NULL
);
ALTER TABLE "public"."class_question_bank" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."classes" (
    "class_id" bigint NOT NULL,
    "name" character varying(100),
    "section_number" character varying(20),
    "description" character varying(255)
);
ALTER TABLE "public"."classes" OWNER TO "postgres";
ALTER TABLE "public"."classes" ALTER COLUMN "class_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classes_class_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "student_id" bigint NOT NULL,
    "class_id" bigint NOT NULL
);
ALTER TABLE "public"."enrollments" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."lesson_question_bank" (
    "owner_id" "uuid" NOT NULL,
    "lesson_id" bigint NOT NULL,
    "question_id" bigint NOT NULL
);
ALTER TABLE "public"."lesson_question_bank" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "lesson_id" bigint NOT NULL,
    "name" character varying(50),
    "topics" character varying(100)[],
    "is_draft" boolean
);
ALTER TABLE "public"."lessons" OWNER TO "postgres";
ALTER TABLE "public"."lessons" ALTER COLUMN "lesson_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lessons_lesson_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."professor_courses" (
    "owner_id" "uuid" NOT NULL,
    "class_id" bigint NOT NULL
);
ALTER TABLE "public"."professor_courses" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."professors" (
    "professor_id" "uuid" NOT NULL,
    "name" character varying(100)
);
ALTER TABLE "public"."professors" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."questions" (
    "question_id" bigint NOT NULL,
    "question_type" character varying(25),
    "prompt" character varying(255),
    "snippet" character varying(255),
    "topics" character varying(100)[],
    "answer_options" character varying(255)[],
    "answer" character varying(255)
);
ALTER TABLE "public"."questions" OWNER TO "postgres";
ALTER TABLE "public"."questions" ALTER COLUMN "question_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."questions_question_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."student_knowledge_graph" (
    "student_id" bigint,
    "class_id" bigint,
    "graph_id" bigint NOT NULL,
    "nodes" character varying(100)[],
    "edges" character varying(100)[],
    "react_flow_data" "jsonb"[]
);
ALTER TABLE "public"."student_knowledge_graph" OWNER TO "postgres";
ALTER TABLE "public"."student_knowledge_graph" ALTER COLUMN "graph_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."student_knowledge_graph_graph_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."students" (
    "student_id" bigint NOT NULL,
    "name" character varying(100)
);
ALTER TABLE "public"."students" OWNER TO "postgres";
ALTER TABLE "public"."students" ALTER COLUMN "student_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."students_student_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
ALTER TABLE ONLY "public"."class_knowledge_graph"
    ADD CONSTRAINT "class_knowledge_graph_class_id_key" UNIQUE ("class_id");
ALTER TABLE ONLY "public"."class_knowledge_graph"
    ADD CONSTRAINT "class_knowledge_graph_pkey" PRIMARY KEY ("graph_id");
ALTER TABLE ONLY "public"."class_lesson_bank"
    ADD CONSTRAINT "class_lesson_bank_pkey" PRIMARY KEY ("owner_id", "lesson_id", "class_id");
ALTER TABLE ONLY "public"."class_question_bank"
    ADD CONSTRAINT "class_question_bank_pkey" PRIMARY KEY ("owner_id", "class_id", "question_id");
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("class_id");
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("student_id", "class_id");
ALTER TABLE ONLY "public"."lesson_question_bank"
    ADD CONSTRAINT "lesson_question_bank_pkey" PRIMARY KEY ("owner_id", "lesson_id", "question_id");
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("lesson_id");
ALTER TABLE ONLY "public"."professor_courses"
    ADD CONSTRAINT "professor_courses_pkey" PRIMARY KEY ("owner_id", "class_id");
ALTER TABLE ONLY "public"."professors"
    ADD CONSTRAINT "professors_pkey" PRIMARY KEY ("professor_id");
ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("question_id");
ALTER TABLE ONLY "public"."student_knowledge_graph"
    ADD CONSTRAINT "student_knowledge_graph_pkey" PRIMARY KEY ("graph_id");
ALTER TABLE ONLY "public"."student_knowledge_graph"
    ADD CONSTRAINT "student_knowledge_graph_student_id_class_id_key" UNIQUE ("student_id", "class_id");
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("student_id");
ALTER TABLE ONLY "public"."class_knowledge_graph"
    ADD CONSTRAINT "class_knowledge_graph_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("class_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_lesson_bank"
    ADD CONSTRAINT "class_lesson_bank_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("class_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_lesson_bank"
    ADD CONSTRAINT "class_lesson_bank_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("lesson_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_lesson_bank"
    ADD CONSTRAINT "class_lesson_bank_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."professors"("professor_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_question_bank"
    ADD CONSTRAINT "class_question_bank_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("class_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_question_bank"
    ADD CONSTRAINT "class_question_bank_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."professors"("professor_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_question_bank"
    ADD CONSTRAINT "class_question_bank_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("question_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("class_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_question_bank"
    ADD CONSTRAINT "lesson_question_bank_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("lesson_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_question_bank"
    ADD CONSTRAINT "lesson_question_bank_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."professors"("professor_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_question_bank"
    ADD CONSTRAINT "lesson_question_bank_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("question_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."professor_courses"
    ADD CONSTRAINT "professor_courses_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("class_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."professor_courses"
    ADD CONSTRAINT "professor_courses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."professors"("professor_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."professors"
    ADD CONSTRAINT "professors_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_knowledge_graph"
    ADD CONSTRAINT "student_knowledge_graph_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("class_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_knowledge_graph"
    ADD CONSTRAINT "student_knowledge_graph_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON DELETE CASCADE;
CREATE POLICY "Professors can fetch their own classes only." ON "public"."professor_courses" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));
ALTER TABLE "public"."professor_courses" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON TABLE "public"."class_knowledge_graph" TO "anon";
GRANT ALL ON TABLE "public"."class_knowledge_graph" TO "authenticated";
GRANT ALL ON TABLE "public"."class_knowledge_graph" TO "service_role";
GRANT ALL ON SEQUENCE "public"."class_knowledge_graph_graph_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."class_knowledge_graph_graph_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."class_knowledge_graph_graph_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."class_lesson_bank" TO "anon";
GRANT ALL ON TABLE "public"."class_lesson_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."class_lesson_bank" TO "service_role";
GRANT ALL ON TABLE "public"."class_question_bank" TO "anon";
GRANT ALL ON TABLE "public"."class_question_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."class_question_bank" TO "service_role";
GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";
GRANT ALL ON SEQUENCE "public"."classes_class_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."classes_class_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classes_class_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";
GRANT ALL ON TABLE "public"."lesson_question_bank" TO "anon";
GRANT ALL ON TABLE "public"."lesson_question_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_question_bank" TO "service_role";
GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";
GRANT ALL ON SEQUENCE "public"."lessons_lesson_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lessons_lesson_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lessons_lesson_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."professor_courses" TO "anon";
GRANT ALL ON TABLE "public"."professor_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."professor_courses" TO "service_role";
GRANT ALL ON TABLE "public"."professors" TO "anon";
GRANT ALL ON TABLE "public"."professors" TO "authenticated";
GRANT ALL ON TABLE "public"."professors" TO "service_role";
GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";
GRANT ALL ON SEQUENCE "public"."questions_question_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."questions_question_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."questions_question_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."student_knowledge_graph" TO "anon";
GRANT ALL ON TABLE "public"."student_knowledge_graph" TO "authenticated";
GRANT ALL ON TABLE "public"."student_knowledge_graph" TO "service_role";
GRANT ALL ON SEQUENCE "public"."student_knowledge_graph_graph_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."student_knowledge_graph_graph_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."student_knowledge_graph_graph_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";
GRANT ALL ON SEQUENCE "public"."students_student_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."students_student_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."students_student_id_seq" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";
RESET ALL;
